"""Onde avisar: cada bandeja do Windows (PC de casa, notebook...) tem sua própria regra de alerta.

A bandeja se apresenta a cada leitura (POST /api/alert-devices/hello com um id aleatório guardado
no próprio computador) e recebe a regra dela:
- "watched": avisa das câmeras monitoradas (o sino no painel), como antes;
- "some": só das câmeras escolhidas para este aparelho;
- "none": não avisa neste aparelho.
Mais "game" (segura os avisos com jogo ou vídeo em tela cheia) e "pausedUntil" (pausa até um
horário). A contagem de movimentos novos e a ordem das câmeras continuam iguais em todo lugar.
"""
from copy import deepcopy
import json
from pathlib import Path
import re
import threading
import time

from .models import AppError

MAX_DEVICES = 10
ONLINE_SECONDS = 90
PAUSE_FOREVER = 4102444800  # 2100-01-01: "até eu reativar"
ID = re.compile(r"[0-9a-f]{16}")


def _name(value):
    return value.strip()[:30] if isinstance(value, str) and value.strip() else None


class AlertDevices:
    def __init__(self, data_dir, cameras=lambda: [], clock=time.time):
        self.path = Path(data_dir) / "avisos-dispositivos.json"
        self.cameras, self.clock = cameras, clock
        self.lock = threading.Lock()
        self.live = {}  # id -> {"seen": ts, "busy": bool}; só em memória
        try:
            saved = json.loads(self.path.read_text(encoding="utf-8"))
            self.devices = {k: v for k, v in saved.get("devices", {}).items() if ID.fullmatch(k) and isinstance(v, dict)}
        except (OSError, ValueError, AttributeError):
            self.devices = {}

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"devices": self.devices}, ensure_ascii=False), encoding="utf-8")
        temporary.replace(self.path)

    @staticmethod
    def _rule(device):
        return {"name": device["name"], "mode": device.get("mode", "watched"), "cameras": list(device.get("cameras", [])),
                "game": device.get("game", True), "pausedUntil": device.get("pausedUntil", 0)}

    def hello(self, body):
        """A bandeja se apresenta ({"id", "name", "busy"}) e recebe a regra dela."""
        if not isinstance(body, dict) or not set(body) <= {"id", "name", "busy"} or not isinstance(body.get("id"), str) or not ID.fullmatch(body["id"]):
            raise AppError("Aparelho inválido.")
        with self.lock:
            device = self.devices.get(body["id"])
            if device is None:
                if len(self.devices) >= MAX_DEVICES:
                    # Sem vaga: o mais antigo sem aparecer há mais tempo sai (bandeja desinstalada).
                    oldest = min(self.devices, key=lambda k: self.devices[k].get("lastSeen", 0))
                    del self.devices[oldest]
                device = self.devices[body["id"]] = {"name": _name(body.get("name")) or "Computador", "mode": "watched", "cameras": [], "game": True, "pausedUntil": 0, "lastSeen": int(self.clock())}
                self._save()
            elif self.clock() - device.get("lastSeen", 0) > 3600:
                device["lastSeen"] = int(self.clock())  # grava no máximo de hora em hora
                self._save()
            self.live[body["id"]] = {"seen": self.clock(), "busy": body.get("busy") is True}
            return {"id": body["id"], **self._rule(device)}

    def status(self):
        with self.lock:
            now = self.clock()
            result = []
            for device_id, device in self.devices.items():
                live = self.live.get(device_id, {})
                online = now - live.get("seen", 0) <= ONLINE_SECONDS
                result.append({"id": device_id, **self._rule(device), "online": online, "busy": online and live.get("busy", False),
                               "lastSeen": int(max(live.get("seen", 0), device.get("lastSeen", 0)))})
            result.sort(key=lambda d: d["name"].casefold())
            return {"devices": deepcopy(result), "now": int(now)}

    def update(self, device_id, body):
        allowed = {"name", "mode", "cameras", "game", "pausedUntil"}
        if not isinstance(body, dict) or not body or not set(body) <= allowed:
            raise AppError("Ajuste inválido.")
        changes = {}
        if "name" in body:
            if not _name(body["name"]):
                raise AppError("Dê um nome de até 30 caracteres.")
            changes["name"] = _name(body["name"])
        if "mode" in body:
            if body["mode"] not in {"watched", "some", "none"}:
                raise AppError("Escolha quando avisar.")
            changes["mode"] = body["mode"]
        if "cameras" in body:
            known = set(self.cameras())
            if not isinstance(body["cameras"], list) or len(body["cameras"]) > 32 or any(c not in known for c in body["cameras"]):
                raise AppError("Câmera desconhecida.")
            changes["cameras"] = sorted(set(body["cameras"]))
        if "game" in body:
            if type(body["game"]) is not bool:
                raise AppError("Ajuste inválido.")
            changes["game"] = body["game"]
        if "pausedUntil" in body:
            until = body["pausedUntil"]
            if type(until) is not int or not (until == 0 or until == PAUSE_FOREVER or self.clock() < until <= self.clock() + 7 * 86400):
                raise AppError("Pausa de até 7 dias (ou até reativar).")
            changes["pausedUntil"] = until
        with self.lock:
            device = self.devices.get(device_id)
            if device is None:
                raise AppError("Aparelho não encontrado.", 404, "not_found")
            device.update(changes)
            self._save()
        return self.status()

    def remove(self, device_id):
        with self.lock:
            if self.devices.pop(device_id, None) is None:
                raise AppError("Aparelho não encontrado.", 404, "not_found")
            self.live.pop(device_id, None)
            self._save()
        return self.status()
