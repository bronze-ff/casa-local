"""Modos da casa (as antigas cenas, agora editáveis): "Cheguei", "Leitura", "Filme"...

Cada modo diz, por aparelho, o que fazer: não mexer, desligar ou ligar com um ajuste. O ar pode
"manter se já estiver ligado" (ex.: ligado pelo celular antes de chegar). Ficam em .data/modos.json;
na primeira vez nascem das três cenas antigas, com os nomes personalizados de .data/scenes.json.
"""
from copy import deepcopy
import json
from pathlib import Path
import re
import secrets
import threading

from .models import FANS, MODES, SCENE_COMMANDS, SCENES, AppError

MAX_MODES = 12
ICONS = ("home", "film", "moon", "book", "sun", "sofa", "coffee", "bed", "power")
LIGHTS = {"quarto-luz": "Luz do quarto", "banheiro-luz": "Luz do banheiro"}
CLIMATE = "ar-quarto"
FAN_NAMES = {"auto": "auto", "low": "baixa", "medium": "média", "high": "alta"}
MODE_NAMES = {"cool": "resfriar", "heat": "aquecer", "dry": "desumidificar", "fan": "ventilar", "auto": "automático"}
DEFAULT_ICONS = {"cinema": "film", "boa-noite": "moon", "cheguei": "home"}


def _flag(value):
    if type(value) is not bool:
        raise AppError("Modo inválido.")
    return value


def validate_step(device_id, step):
    if not isinstance(step, dict) or "power" not in step:
        raise AppError("Ajuste de aparelho inválido.")
    if not _flag(step["power"]):
        if set(step) != {"power"}:
            raise AppError("Ajuste de aparelho inválido.")
        return {"power": False}
    if device_id in LIGHTS:
        if set(step) != {"power", "brightness", "colorHex"}:
            raise AppError("Escolha brilho e cor da luz.")
        brightness, color = step["brightness"], step["colorHex"]
        if type(brightness) is not int or not 10 <= brightness <= 100:
            raise AppError("Brilho entre 10 e 100%.")
        if not isinstance(color, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            raise AppError("Cor inválida.")
        return {"power": True, "brightness": brightness, "colorHex": color.upper()}
    if set(step) != {"power", "temperature", "mode", "fan", "keepIfOn"}:
        raise AppError("Escolha temperatura, modo e ventilação do ar.")
    temperature = step["temperature"]
    if type(temperature) is not int or not 17 <= temperature <= 30:
        raise AppError("Temperatura entre 17 e 30 °C.")
    if step["mode"] not in MODES or step["fan"] not in FANS:
        raise AppError("Modo ou ventilação do ar inválidos.")
    return {"power": True, "temperature": temperature, "mode": step["mode"], "fan": step["fan"], "keepIfOn": _flag(step["keepIfOn"])}


def validate_mode(body):
    if not isinstance(body, dict) or not set(body) <= {"id", "name", "icon", "steps"}:
        raise AppError("Modo inválido.")
    name, icon, steps = body.get("name"), body.get("icon"), body.get("steps")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 30:
        raise AppError("Dê um nome de até 30 caracteres.")
    if icon not in ICONS:
        raise AppError("Ícone inválido.")
    if not isinstance(steps, dict) or not set(steps) <= {*LIGHTS, CLIMATE}:
        raise AppError("Aparelho desconhecido no modo.")
    if not steps:
        raise AppError("Escolha o que o modo faz em pelo menos um aparelho.")
    return {"name": name.strip(), "icon": icon, "steps": {device: validate_step(device, step) for device, step in steps.items()}}


def describe(steps):
    """Resumo curto, ex.: "Quarto 15% · Banheiro apagada · Ar 24 °C (se desligado)"."""
    parts = []
    for device_id, label in (("quarto-luz", "Quarto"), ("banheiro-luz", "Banheiro")):
        step = steps.get(device_id)
        if step:
            parts.append(f"{label} {step['brightness']}%" if step["power"] else f"{label} apagada")
    step = steps.get(CLIMATE)
    if step:
        parts.append(f"Ar {step['temperature']} °C {MODE_NAMES[step['mode']]}{' (se desligado)' if step['keepIfOn'] else ''}" if step["power"] else "Ar desligado")
    return " · ".join(parts)


def _defaults(data_dir):
    """As três cenas antigas, com os nomes personalizados (se houver) de scenes.json."""
    try:
        custom = json.loads((Path(data_dir) / "scenes.json").read_text(encoding="utf-8"))
        custom = custom if isinstance(custom, dict) else {}
    except (OSError, ValueError):
        custom = {}
    modes = []
    for scene in SCENES:
        name = custom.get(scene["id"], {}).get("name") if isinstance(custom.get(scene["id"]), dict) else None
        steps = {}
        for device_id, values in SCENE_COMMANDS[scene["id"]]:
            if values.get("power") and device_id in LIGHTS:
                steps[device_id] = {"power": True, "brightness": values["brightness"], "colorHex": values["colorHex"]}
            elif not values.get("power"):
                steps[device_id] = {"power": False}
        modes.append({"id": scene["id"], "name": name.strip()[:30] if isinstance(name, str) and name.strip() else scene["name"], "icon": DEFAULT_ICONS[scene["id"]], "steps": steps})
    return modes


class Modes:
    def __init__(self, data_dir):
        self.path = Path(data_dir) / "modos.json"
        self.lock = threading.Lock()
        try:
            saved = json.loads(self.path.read_text(encoding="utf-8"))
            modes = [{"id": m["id"], **validate_mode({k: m.get(k) for k in ("name", "icon", "steps")})} for m in saved["modes"]
                     if isinstance(m, dict) and isinstance(m.get("id"), str) and re.fullmatch(r"[a-z0-9-]{1,24}", m["id"])]
        except (OSError, ValueError, KeyError, TypeError, AppError):
            modes = None
        self.modes = modes if modes is not None else _defaults(data_dir)

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"modes": self.modes}, ensure_ascii=False), encoding="utf-8")
        temporary.replace(self.path)

    def public(self):
        """Para o painel e a bandeja: inclui o resumo e os aparelhos usados (para avisar se falta configurar)."""
        with self.lock:
            return [{**deepcopy(mode), "description": describe(mode["steps"]), "devices": sorted(mode["steps"])} for mode in self.modes]

    def get(self, mode_id):
        with self.lock:
            mode = next((m for m in self.modes if m["id"] == mode_id), None)
            if mode is None:
                raise AppError("Modo não encontrado.", 404, "not_found")
            return deepcopy(mode)

    def exists(self, mode_id):
        with self.lock:
            return any(m["id"] == mode_id for m in self.modes)

    def save(self, body):
        mode = validate_mode(body)
        with self.lock:
            existing = next((m for m in self.modes if m["id"] == body.get("id")), None) if body.get("id") else None
            if body.get("id") and existing is None:
                raise AppError("Modo não encontrado.", 404, "not_found")
            if any(m["name"].casefold() == mode["name"].casefold() and m is not existing for m in self.modes):
                raise AppError("Já existe um modo com esse nome.")
            if existing:
                existing.update(mode)
            else:
                if len(self.modes) >= MAX_MODES:
                    raise AppError(f"No máximo {MAX_MODES} modos.")
                self.modes.append({"id": f"m-{secrets.token_hex(3)}", **mode})
            self._save()
        return self.public()

    def remove(self, mode_id):
        with self.lock:
            before = len(self.modes)
            self.modes = [m for m in self.modes if m["id"] != mode_id]
            if len(self.modes) == before:
                raise AppError("Modo não encontrado.", 404, "not_found")
            self._save()
        return self.public()

    def reorder(self, ids):
        with self.lock:
            if not isinstance(ids, list) or sorted(ids) != sorted(m["id"] for m in self.modes):
                raise AppError("Ordem inválida.")
            self.modes.sort(key=lambda m: ids.index(m["id"]))
            self._save()
        return self.public()
