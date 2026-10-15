"""Public inventory and strict command validation; no provider secrets here."""
from copy import deepcopy
from datetime import datetime, timezone
import re

VERSION = "0.1.0"
TV_KEYS = {"power", "volume_up", "volume_down", "mute", "up", "down", "left", "right", "ok", "home", "back", "source"}
MODES = {"cool", "heat", "dry", "fan", "auto"}
FANS = {"auto", "low", "medium", "high"}
INVENTORY = [
    {"id": "quarto-luz", "kind": "light", "roomId": "quarto", "name": "Luz do quarto", "brand": "Intelbras", "state": {"power": True, "brightness": 87, "colorHex": "#FFD6A0"}},
    {"id": "banheiro-luz", "kind": "light", "roomId": "banheiro", "name": "Luz do banheiro", "brand": "Intelbras", "state": {"power": False, "brightness": 100, "colorHex": "#FFFFFF"}},
    {"id": "ar-quarto", "kind": "climate", "roomId": "quarto", "name": "Ar do quarto", "brand": "Electrolux · Geonav IR", "state": {"power": False, "temperature": 24, "mode": "cool", "fan": "auto"}},
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
    def __init__(self, message, status=400, code="invalid_request"):
        super().__init__(message)
        self.status, self.code = status, code


def validate_command(kind, body):
    if not isinstance(body, dict):
        raise AppError("Comando inválido.")
    if kind == "tv":
        if set(body) != {"action", "key"} or body.get("action") != "key" or not isinstance(body.get("key"), str) or body.get("key") not in TV_KEYS:
            raise AppError("Tecla não permitida.")
        return deepcopy(body)
    if set(body) != {"action", "values"} or body.get("action") != "set":
        raise AppError("Comando inválido.")
    values = body.get("values")
    allowed = {"power", "brightness", "colorHex"} if kind == "light" else {"power", "temperature", "mode", "fan"}
    if not isinstance(values, dict) or not values or not set(values).issubset(allowed):
        raise AppError("Ajustes não permitidos.")
    for key, value in values.items():
        valid = False
        if key == "power":
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
