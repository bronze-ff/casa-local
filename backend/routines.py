"""Rotinas no servidor: horários fixos por dia da semana e timers de uma vez ("desligar em 2 h").

As ações usam os mesmos caminhos do painel (comando de aparelho ou cena), com a mesma validação.
Nenhuma rotina vem pronta: só roda o que o dono cadastrar. Se o servidor estava parado na hora
marcada, a rotina ainda roda se ele voltar em até 5 minutos; depois disso, fica para o próximo dia.
"""
from copy import deepcopy
from datetime import datetime, timedelta
import json
from pathlib import Path
import re
import secrets
import threading
import time

from .models import INVENTORY, SCENE_COMMANDS, AppError, validate_command

GRACE_SECONDS = 300
TIMER_RETRIES, TIMER_RETRY_SECONDS = 10, 60  # ar indisponível na hora: tenta de novo por ~10 min
MAX_ROUTINES = 20
DEVICE_KINDS = {d["id"]: d["kind"] for d in INVENTORY if d["kind"] in {"light", "climate"}}


def validate_action(action):
    if not isinstance(action, dict):
        raise AppError("Ação inválida.")
    if action.get("type") == "scene" and set(action) == {"type", "id"} and action["id"] in SCENE_COMMANDS:
        return deepcopy(action)
    if action.get("type") == "device" and set(action) == {"type", "device", "values"} and action["device"] in DEVICE_KINDS:
        validate_command(DEVICE_KINDS[action["device"]], {"action": "set", "values": action["values"]})
        return deepcopy(action)
    raise AppError("Ação inválida: escolha uma cena ou um ajuste de luz ou ar.")


def validate_routine(body):
    if not isinstance(body, dict) or not set(body) <= {"id", "name", "enabled", "days", "time", "action"}:
        raise AppError("Rotina inválida.")
    name, days, at = body.get("name"), body.get("days"), body.get("time")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 40:
        raise AppError("Dê um nome de até 40 caracteres.")
    if not isinstance(days, list) or not days or len(set(days)) != len(days) or any(type(d) is not int or not 0 <= d <= 6 for d in days):
        raise AppError("Escolha pelo menos um dia da semana.")
    if not isinstance(at, str) or not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", at):
        raise AppError("Horário inválido (use HH:MM).")
    enabled = body.get("enabled", True)
    if type(enabled) is not bool:
        raise AppError("Rotina inválida.")
    return {"name": name.strip(), "enabled": enabled, "days": sorted(days), "time": at, "action": validate_action(body.get("action"))}


class Routines:
    def __init__(self, app, data_dir, clock=time.time):
        self.app, self.clock = app, clock
        self.path = Path(data_dir) / "rotinas.json"
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread = None
        try:
            saved = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            saved = {}
        self.routines = saved.get("routines", []) if isinstance(saved.get("routines"), list) else []
        self.timers = saved.get("timers", []) if isinstance(saved.get("timers"), list) else []
        self.log = saved.get("log", [])[-30:] if isinstance(saved.get("log"), list) else []

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"routines": self.routines, "timers": self.timers, "log": self.log[-30:]}, ensure_ascii=False), encoding="utf-8")
        temporary.replace(self.path)

    # ---- cadastro ----
    def save(self, body):
        routine = validate_routine(body)
        with self.lock:
            existing = next((r for r in self.routines if r["id"] == body.get("id")), None) if body.get("id") else None
            if existing:
                existing.update(routine)
            else:
                if len(self.routines) >= MAX_ROUTINES:
                    raise AppError(f"No máximo {MAX_ROUTINES} rotinas.")
                # Marca o minuto atual como já visto: criar às 07:00 uma rotina das 07:00 não dispara na hora.
                self.routines.append({"id": secrets.token_hex(4), **routine, "lastRun": self._slot(datetime.fromtimestamp(self.clock()))})
            self._save()
        return self.status()

    def remove(self, routine_id):
        with self.lock:
            before = len(self.routines)
            self.routines = [r for r in self.routines if r["id"] != routine_id]
            if len(self.routines) == before:
                raise AppError("Rotina não encontrada.", 404, "not_found")
            self._save()
        return self.status()

    def set_timer(self, body):
        if not isinstance(body, dict) or set(body) != {"device", "minutes"} or body.get("device") != "ar-quarto":
            raise AppError("Timer inválido.")
        minutes = body["minutes"]
        if type(minutes) is not int or not (minutes == 0 or 15 <= minutes <= 720):
            raise AppError("Escolha de 15 minutos a 12 horas (0 cancela).")
        with self.lock:
            self.timers = [t for t in self.timers if t["device"] != "ar-quarto"]
            if minutes:
                self.timers.append({"id": secrets.token_hex(4), "device": "ar-quarto", "at": int(self.clock() + minutes * 60),
                                    "label": "Desligar o ar", "action": {"type": "device", "device": "ar-quarto", "values": {"power": False}}})
            self._save()
        return self.status()

    def status(self):
        with self.lock:
            now = datetime.fromtimestamp(self.clock())
            routines = []
            for routine in self.routines:
                item = {k: v for k, v in routine.items() if k != "lastRun"}
                item["next"] = self._next_time(routine, now) if routine["enabled"] else None
                routines.append(item)
            return {"routines": routines, "timers": deepcopy(self.timers), "log": deepcopy(self.log[-10:][::-1])}

    # ---- execução ----
    @staticmethod
    def _slot(moment):
        return moment.strftime("%Y-%m-%d %H:%M")

    @staticmethod
    def _next_time(routine, now):
        hour, minute = map(int, routine["time"].split(":"))
        for ahead in range(8):
            day = now + timedelta(days=ahead)
            candidate = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if candidate.weekday() in routine["days"] and candidate > now:
                return int(candidate.timestamp())
        return None

    def due(self):
        """Ações vencidas agora: (nome, ação, id do timer ou None). Rotinas ficam marcadas como
        feitas; timers só saem da lista quando o comando dá certo (ver run)."""
        now_ts = self.clock()
        now = datetime.fromtimestamp(now_ts)
        ready = []
        with self.lock:
            for routine in self.routines:
                if not routine["enabled"]:
                    continue
                hour, minute = map(int, routine["time"].split(":"))
                scheduled = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                if scheduled > now:
                    scheduled -= timedelta(days=1)
                slot = self._slot(scheduled)
                if scheduled.weekday() in routine["days"] and 0 <= (now - scheduled).total_seconds() <= GRACE_SECONDS and routine.get("lastRun") != slot:
                    routine["lastRun"] = slot
                    ready.append((routine["name"], routine["action"], None))
            for timer in [t for t in self.timers if t["at"] <= now_ts]:
                ready.append((timer["label"], timer["action"], timer["id"]))
            if ready:
                self._save()
        return ready

    def run(self, name, action, timer_id=None):
        try:
            if action["type"] == "scene":
                result = self.app.scene(action["id"])
                ok = result.get("status") != "partial"
            else:
                self.app.command(action["device"], {"action": "set", "values": action["values"]}, origin=f"Rotina {name}")
                ok = True
            message = "executada" if ok else "executada com falhas"
        except AppError as error:
            ok, message = False, str(error)
        with self.lock:
            timer = next((t for t in self.timers if t["id"] == timer_id), None) if timer_id else None
            if timer and not ok and timer.get("attempts", 0) + 1 < TIMER_RETRIES:
                # Falha passageira (ar sem resposta): o desligar é idempotente, tenta de novo em 1 min.
                timer["attempts"] = timer.get("attempts", 0) + 1
                timer["at"] = int(self.clock() + TIMER_RETRY_SECONDS)
                message += " · tentando de novo em 1 min"
            elif timer:
                self.timers.remove(timer)
            self.log.append({"at": int(self.clock()), "name": name, "ok": ok, "message": message})
            self._save()
        return ok

    def start(self):
        if self.thread is not None:
            return

        def loop():
            while not self.stop_event.is_set():
                for name, action, timer_id in self.due():
                    self.run(name, action, timer_id)
                self.stop_event.wait(15)

        self.thread = threading.Thread(target=loop, daemon=True, name="casa-rotinas")
        self.thread.start()

    def close(self):
        self.stop_event.set()
