"""Rotinas no servidor: horários fixos por dia da semana, chegada/saída de um lugar (localização do
celular) e timers de uma vez ("desligar em 2 h").

As ações usam os mesmos caminhos do painel (comando de aparelho ou cena), com a mesma validação.
Nenhuma rotina vem pronta: só roda o que o dono cadastrar. Se o servidor estava parado na hora
marcada, a rotina ainda roda se ele voltar em até 5 minutos; depois disso, fica para o próximo dia.
Rotinas de lugar ("saí da academia" → modo Cheguei) só reagem a transições recentes (até 10 min),
podem ter uma faixa de horário e não repetem em menos de 30 min (o GPS às vezes oscila na borda).
"""
from copy import deepcopy
from datetime import datetime, timedelta
import json
from pathlib import Path
import re
import secrets
import threading
import time

from .models import INVENTORY, AppError, validate_command

GRACE_SECONDS = 300
TIMER_RETRIES, TIMER_RETRY_SECONDS = 10, 60  # ar indisponível na hora: tenta de novo por ~10 min
MAX_ROUTINES = 20
PLACE_FRESH, PLACE_COOLDOWN = 600, 1800
HHMM = r"([01]\d|2[0-3]):[0-5]\d"
DEVICE_KINDS = {d["id"]: d["kind"] for d in INVENTORY if d["kind"] in {"light", "climate"}}


def validate_action(action):
    if not isinstance(action, dict):
        raise AppError("Ação inválida.")
    if action.get("type") == "scene" and set(action) == {"type", "id"} and isinstance(action["id"], str) and re.fullmatch(r"[a-z0-9-]{1,24}", action["id"]):
        return deepcopy(action)  # a existência do modo é conferida ao salvar (Routines.save)
    if action.get("type") == "device" and set(action) == {"type", "device", "values"} and action["device"] in DEVICE_KINDS:
        validate_command(DEVICE_KINDS[action["device"]], {"action": "set", "values": action["values"]})
        return deepcopy(action)
    raise AppError("Ação inválida: escolha um modo ou um ajuste de luz ou ar.")


def validate_routine(body):
    """Rotina de horário ({"time"}) ou de lugar ({"trigger": "place", "place", "event", "between"})."""
    if not isinstance(body, dict) or not set(body) <= {"id", "name", "enabled", "days", "time", "action", "trigger", "place", "event", "between", "person"}:
        raise AppError("Rotina inválida.")
    name, days = body.get("name"), body.get("days")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 40:
        raise AppError("Dê um nome de até 40 caracteres.")
    if not isinstance(days, list) or not days or len(set(days)) != len(days) or any(type(d) is not int or not 0 <= d <= 6 for d in days):
        raise AppError("Escolha pelo menos um dia da semana.")
    enabled = body.get("enabled", True)
    if type(enabled) is not bool:
        raise AppError("Rotina inválida.")
    routine = {"name": name.strip(), "enabled": enabled, "days": sorted(days), "action": validate_action(body.get("action"))}
    trigger = body.get("trigger", "time")
    if trigger == "time":
        at = body.get("time")
        if not isinstance(at, str) or not re.fullmatch(HHMM, at) or {"place", "event", "between", "person"} & set(body):
            raise AppError("Horário inválido (use HH:MM).")
        return {**routine, "trigger": "time", "time": at}
    if trigger != "place" or "time" in body:
        raise AppError("Rotina inválida.")
    place, event, between = body.get("place"), body.get("event"), body.get("between")
    if not isinstance(place, str) or not re.fullmatch(r"[a-z0-9-]{1,24}", place):
        raise AppError("Escolha um lugar.")
    if event not in {"chegou", "saiu"}:
        raise AppError("Escolha chegar ou sair do lugar.")
    if between is not None and not (isinstance(between, list) and len(between) == 2 and all(isinstance(t, str) and re.fullmatch(HHMM, t) for t in between) and between[0] != between[1]):
        raise AppError("Faixa de horário inválida (use HH:MM até HH:MM).")
    person = body.get("person")
    if person is not None and not (isinstance(person, str) and re.fullmatch(r"[a-z0-9-]{1,24}", person)):
        raise AppError("Pessoa inválida.")
    return {**routine, "trigger": "place", "place": place, "event": event, "between": between, "person": person}


def in_window(between, moment):
    """Dentro da faixa "HH:MM"–"HH:MM" (pode virar a meia-noite, ex.: 22:00–02:00)."""
    if not between:
        return True
    start, end, now = between[0], between[1], moment.strftime("%H:%M")
    return start <= now < end if start < end else now >= start or now < end


class Routines:
    def __init__(self, app, data_dir, clock=time.time, places=lambda: None, people=lambda: []):
        # places(): ids dos lugares cadastrados (None se a localização não estiver preparada); people(): ids das pessoas.
        self.app, self.clock, self.places, self.people = app, clock, places, people
        self.wake = threading.Event()
        self.pending = []
        self.listeners = []  # f(nome, ok, mensagem) a cada execução (avisos no celular)
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
        action = routine["action"]
        if action["type"] == "scene" and not self.app.modes.exists(action["id"]):
            raise AppError("Esse modo não existe mais.")
        if routine["trigger"] == "place" and routine["place"] not in (self.places() or []):
            raise AppError("Lugar não encontrado (cadastre-o na aba Local).")
        if routine.get("person") and routine["person"] not in (self.people() or []):
            raise AppError("Pessoa não encontrada (cadastre-a na aba Local).")
        with self.lock:
            existing = next((r for r in self.routines if r["id"] == body.get("id")), None) if body.get("id") else None
            # Salvar conta o último horário marcado como já feito: criar ou editar às 07:03 uma rotina
            # das 07:00 não dispara na hora (só na próxima vez).
            consumed = self._latest_slot(routine, datetime.fromtimestamp(self.clock())) if routine["trigger"] == "time" else None
            if existing:
                for key in ("time", "place", "event", "between", "person"):
                    existing.pop(key, None)  # trocar de horário para lugar (ou o contrário) não deixa sobra
                existing.update(routine, lastRun=consumed)
            else:
                if len(self.routines) >= MAX_ROUTINES:
                    raise AppError(f"No máximo {MAX_ROUTINES} rotinas.")
                self.routines.append({"id": secrets.token_hex(4), **routine, "lastRun": consumed})
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
                item = {"trigger": "time", **{k: v for k, v in routine.items() if k not in {"lastRun", "lastFired"}}}
                item["next"] = self._next_time(routine, now) if routine["enabled"] and item["trigger"] == "time" else None
                routines.append(item)
            return {"routines": routines, "timers": deepcopy(self.timers), "log": deepcopy(self.log[-10:][::-1])}

    # ---- execução ----
    @staticmethod
    def _slot(moment):
        return moment.strftime("%Y-%m-%d %H:%M")

    @classmethod
    def _latest_slot(cls, routine, now):
        """Horário marcado mais recente (agora ou antes) num dos dias escolhidos."""
        hour, minute = map(int, routine["time"].split(":"))
        for back in range(8):
            candidate = (now - timedelta(days=back)).replace(hour=hour, minute=minute, second=0, microsecond=0)
            if candidate <= now and candidate.weekday() in routine["days"]:
                return cls._slot(candidate)
        return None

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
                if not routine["enabled"] or routine.get("trigger", "time") != "time":
                    continue
                hour, minute = map(int, routine["time"].split(":"))
                scheduled = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                if scheduled > now:
                    scheduled -= timedelta(days=1)
                slot = self._slot(scheduled)
                if scheduled.weekday() in routine["days"] and 0 <= (now - scheduled).total_seconds() <= GRACE_SECONDS and routine.get("lastRun") != slot:
                    routine["lastRun"] = slot
                    ready.append((routine["name"], routine["action"], None))
            ready.extend(self.pending)
            self.pending = []
            for timer in [t for t in self.timers if t["at"] <= now_ts]:
                ready.append((timer["label"], timer["action"], timer["id"]))
            if ready:
                self._save()
        return ready

    def on_place(self, event):
        """Transição da localização ({"tst", "kind": chegou|saiu, "place"}): agenda as rotinas que batem."""
        now_ts = self.clock()
        # Fila antiga reenviada pelo celular, ou relógio do celular adiantado: não liga nada fora de hora.
        if not isinstance(event, dict) or not -120 <= now_ts - event.get("tst", 0) <= PLACE_FRESH:
            return
        moment = datetime.fromtimestamp(now_ts)
        with self.lock:
            for routine in self.routines:
                if (routine["enabled"] and routine.get("trigger") == "place" and routine["place"] == event.get("place") and routine["event"] == event.get("kind")
                        and routine.get("person") in (None, event.get("person"))
                        and moment.weekday() in routine["days"] and in_window(routine.get("between"), moment) and now_ts - routine.get("lastFired", 0) >= PLACE_COOLDOWN):
                    routine["lastFired"] = int(now_ts)
                    self.pending.append((routine["name"], routine["action"], None))
            if self.pending:
                self._save()
                self.wake.set()

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
        for listener in self.listeners:
            try:
                listener(name, ok, message)
            except Exception:
                pass
        return ok

    def start(self):
        if self.thread is not None:
            return

        def loop():
            while not self.stop_event.is_set():
                for name, action, timer_id in self.due():
                    self.run(name, action, timer_id)
                self.wake.wait(15)
                self.wake.clear()

        self.thread = threading.Thread(target=loop, daemon=True, name="casa-rotinas")
        self.thread.start()

    def close(self):
        self.stop_event.set()
        self.wake.set()
