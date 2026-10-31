"""Public inventory and strict command validation; no provider secrets here."""
from copy import deepcopy
from datetime import datetime, timezone
from dataclasses import dataclass, field
import math
import re
import secrets
import time

VERSION = "0.1.0"
TV_KEYS = {"power", "volume_up", "volume_down", "mute", "up", "down", "left", "right", "ok", "home", "back", "source"}
MODES = {"cool", "heat", "dry", "fan", "auto"}
FANS = {"auto", "low", "medium", "high"}
# Botões do controle Electrolux que não existem no perfil Geonav: só funcionam depois de gravados
# com Aprender. São alternâncias no aparelho (o estado físico não é conhecido pelo painel).
AC_EXTRA_KEYS = {"turbo", "eco", "brisa", "display"}
# Campos do estado do ar que escolhem o quadro no cadastro; "turbo" é um bit aplicado por cima.
AC_STATE_FIELDS = ("power", "temperature", "mode", "fan")
INVENTORY = [
    {"id": "quarto-luz", "kind": "light", "roomId": "quarto", "name": "Luz do quarto", "brand": "Intelbras", "state": {"power": True, "brightness": 87, "colorHex": "#FFD6A0"}},
    {"id": "banheiro-luz", "kind": "light", "roomId": "banheiro", "name": "Luz do banheiro", "brand": "Intelbras", "state": {"power": False, "brightness": 100, "colorHex": "#FFFFFF"}},
    {"id": "ar-quarto", "kind": "climate", "roomId": "quarto", "name": "Ar do quarto", "brand": "Electrolux · Geonav IR", "state": {"power": False, "temperature": 24, "mode": "cool", "fan": "auto", "turbo": False}},
    {"id": "tv-quarto", "kind": "tv", "roomId": "quarto", "name": "TV do quarto", "brand": "Samsung · Geonav IR", "state": {"power": False, "volume": 18, "source": "HDMI 1", "muted": False}},
]
SCENES = [
    {"id": "cinema", "name": "Cinema", "description": "Luz suave para assistir", "icon": "film"},
    {"id": "boa-noite", "name": "Boa noite", "description": "Apagar as luzes e desligar o ar", "icon": "moon"},
    {"id": "cheguei", "name": "Cheguei", "description": "Iluminar o quarto", "icon": "home"},
]
SCENE_COMMANDS = {
    "cinema": [("quarto-luz", {"power": True, "brightness": 15, "colorHex": "#FFB86B"}), ("banheiro-luz", {"power": False})],
    "boa-noite": [("quarto-luz", {"power": False}), ("banheiro-luz", {"power": False}), ("ar-quarto", {"power": False})],
    "cheguei": [("quarto-luz", {"power": True, "brightness": 87, "colorHex": "#FFD6A0"})],
}


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class AppError(Exception):
    def __init__(self, message, status=400, code="invalid_request", *, receipt=None):
        super().__init__(message)
        self.status, self.code = status, code
        self.receipt = receipt


COMMAND_BUDGET_SECONDS = 6.0


@dataclass(frozen=True)
class CommandContext:
    """One request, one monotonic soft deadline; never a deduplication key."""
    request_id: str
    deadline: float
    _started_at: float = field(default_factory=time.monotonic, init=False, repr=False, compare=False)


def command_context(*, now=None, budget=COMMAND_BUDGET_SECONDS, request_id=None):
    if isinstance(budget, bool) or not isinstance(budget, (int, float)) or not math.isfinite(budget) or budget <= 0:
        raise ValueError("O orçamento deve ser finito e positivo.")
    started = time.monotonic() if now is None else now
    if isinstance(started, bool) or not isinstance(started, (int, float)) or not math.isfinite(started):
        raise ValueError("Relógio monotônico inválido.")
    context = CommandContext(request_id or secrets.token_urlsafe(18), started + budget)
    object.__setattr__(context, "_started_at", started)
    return context


def ensure_command_time(context):
    if time.monotonic() >= context.deadline:
        raise AppError("Prazo encerrado; nenhum comando enviado", 504, "command_deadline_exceeded")


def command_timing(context):
    budget = max(0.0, (context.deadline - context._started_at) * 1000)
    elapsed = max(0.0, (time.monotonic() - context._started_at) * 1000)
    return {"budgetMs": budget, "elapsedMs": elapsed, "overrunMs": max(0.0, elapsed - budget)}


def command_receipt(context, requested, *, delivery="not_sent", reported=None, expected=None, preview=False):
    """Evidence belongs to fields read after emission, independently of transport."""
    requested, reported = deepcopy(requested), deepcopy(reported or {})
    expected = requested if expected is None else expected
    confirmed, diverged = [], []
    for key in requested:
        if key not in reported:
            continue
        actual, wanted = reported[key], expected.get(key, requested[key])
        same = type(actual) is type(wanted) and actual == wanted
        # One percentage point covers integer DP quantization after encoder normalization.
        if key == "brightness" and type(actual) is int and type(wanted) is int:
            same = abs(actual - wanted) <= 1
        elif key == "colorHex" and isinstance(actual, str) and isinstance(wanted, str):
            # Encoder rounds HSV hue/saturation; at most two RGB levels per channel.
            same = all(abs(int(actual[i:i+2], 16) - int(wanted[i:i+2], 16)) <= 2 for i in (1, 3, 5))
        (confirmed if same else diverged).append(key)
    outcome = "preview" if preview else "diverged" if diverged else "confirmed" if requested and len(confirmed) == len(requested) else "unconfirmed"
    return {"requestId": context.request_id, "delivery": delivery, "stateVersion": None,
            "outcome": outcome, "requested": requested, "reported": reported,
            "confirmedFields": sorted(confirmed), "divergedFields": sorted(diverged),
            "observedAt": now() if reported else None, "timing": command_timing(context)}


def validate_command(kind, body):
    if not isinstance(body, dict):
        raise AppError("Comando inválido.")
    if kind == "tv":
        if set(body) != {"action", "key"} or body.get("action") != "key" or not isinstance(body.get("key"), str) or body.get("key") not in TV_KEYS:
            raise AppError("Tecla não permitida.")
        return deepcopy(body)
    if kind == "climate" and body.get("action") == "key":
        if set(body) != {"action", "key"} or body.get("key") not in AC_EXTRA_KEYS:
            raise AppError("Função do ar não permitida.")
        return deepcopy(body)
    if set(body) != {"action", "values"} or body.get("action") != "set":
        raise AppError("Comando inválido.")
    values = body.get("values")
    allowed = {"power", "brightness", "colorHex"} if kind == "light" else {"power", "temperature", "mode", "fan", "turbo"}
    if not isinstance(values, dict) or not values or not set(values).issubset(allowed):
        raise AppError("Ajustes não permitidos.")
    for key, value in values.items():
        valid = False
        if key in {"power", "turbo"}:
            valid = type(value) is bool
        elif key in {"brightness", "temperature"}:
            lo, hi = (0, 100) if key == "brightness" else (17, 30)
            valid = type(value) is int and lo <= value <= hi
        elif key == "colorHex":
            valid = isinstance(value, str) and bool(re.fullmatch(r"#[0-9a-fA-F]{6}", value))
        elif key in {"mode", "fan"}:
            valid = isinstance(value, str) and value in (MODES if key == "mode" else FANS)
        if not valid:
            raise AppError("Valor fora do intervalo permitido.")
    return deepcopy(body)
