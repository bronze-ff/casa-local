"""Movimento nas câmeras pelo canal de eventos local do DVR (Intelbras/Dahua eventManager.cgi).

O DVR mantém uma conexão HTTP aberta e manda uma linha por evento ("Code=VideoMotion;action=Start;
index=3"). As credenciais são as mesmas que o go2rtc já usa, lidas do go2rtc.yaml deste PC na hora
de conectar; nada é copiado para outro arquivo nem sai da rede local. Disparos seguidos da mesma
câmera viram um evento só; cada evento guarda uma foto do momento. Histórico: 48 h, em .data.
"""
import json
import os
from pathlib import Path
import re
import secrets
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import unquote, urlsplit

from .cameras import IDS
from .models import AppError

RETENTION = 48 * 3600
# 15 câmeras geram ~70 eventos por hora: 8000 cobrem as 48 h com folga (fotos ~26 KB cada).
MAX_EVENTS = 8000
LIST_LIMIT = 300  # eventos devolvidos por consulta (todas as câmeras, ou uma só)
MERGE_SECONDS = 90  # novo disparo da mesma câmera dentro disto continua o mesmo evento
OPEN_SECONDS = 300  # evento sem "Stop" (conexão caiu no meio) só junta disparos por até 5 min sem atividade
LINE = re.compile(r"Code=VideoMotion;action=(Start|Stop);index=(\d+)")


def go2rtc_config_path():
    return Path(os.environ.get("CASA_GO2RTC_CONFIG", Path.home() / "AppData" / "Local" / "go2rtc" / "go2rtc.yaml"))


def dvr_source(path=None):
    """(host, usuário, senha) do primeiro rtsp:// do go2rtc.yaml, ou None se não houver."""
    try:
        text = Path(path or go2rtc_config_path()).read_text(encoding="utf-8")
    except OSError:
        return None
    match = re.search(r"rtsp://[^\s'\"]+", text)
    if not match:
        return None
    parts = urlsplit(match.group(0))
    if not parts.hostname or not parts.username:
        return None
    return parts.hostname, unquote(parts.username), unquote(parts.password or "")


class MotionWatcher:
    def __init__(self, cameras, data_dir, source=dvr_source, clock=time.time):
        self.cameras, self.source, self.clock = cameras, source, clock
        self.dir = Path(data_dir) / "movimento"
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread = None
        self.connected, self.last_error, self.last_line = False, None, None
        self.snapshots = threading.BoundedSemaphore(2)
        try:
            saved = json.loads((self.dir / "eventos.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            saved = {}
        self.events = saved.get("events", []) if isinstance(saved.get("events"), list) else []
        self.notify = {c for c in saved.get("notify", []) if c in IDS}
        self.seen_at = saved.get("seenAt", 0) if isinstance(saved.get("seenAt"), (int, float)) else 0

    # ---- armazenamento ----
    def _save(self):
        cutoff = self.clock() - RETENTION
        before = self.events
        self.events = [e for e in before if (e.get("end") or e["start"]) >= cutoff][-MAX_EVENTS:]
        keep = {e["id"] for e in self.events}
        # Apaga a foto de todo evento que saiu, seja pela idade (48 h) ou pelo limite de eventos.
        for event in before:
            if event["id"] not in keep and event.get("photo"):
                try:
                    (self.dir / f"{event['id']}.jpg").unlink()
                except OSError:
                    pass
        self.dir.mkdir(parents=True, exist_ok=True)
        temporary = self.dir / "eventos.tmp"
        temporary.write_text(json.dumps({"events": self.events, "notify": sorted(self.notify), "seenAt": self.seen_at}), encoding="utf-8")
        temporary.replace(self.dir / "eventos.json")

    # ---- eventos ----
    def handle(self, line):
        """Processa uma linha do DVR. Devolve o evento novo (para foto e aviso) ou None."""
        match = LINE.search(line)
        if not match:
            return None
        action, camera_id = match.group(1), f"cam{int(match.group(2)) + 1}"
        if camera_id not in IDS:
            return None
        now = self.clock()
        with self.lock:
            last = next((e for e in reversed(self.events) if e["camera"] == camera_id), None)
            if action == "Stop":
                if last and last.get("end") is None:
                    last["end"] = now
                    self._save()
                return None
            still_open = last and last.get("end") is None and now - last.get("seen", last["start"]) <= OPEN_SECONDS
            recently_closed = last and last.get("end") is not None and now - last["end"] <= MERGE_SECONDS
            if last and last.get("end") is None and not still_open:
                last["end"] = last.get("seen", last["start"])  # aberto e parado: fecha no último disparo
            if still_open or recently_closed:
                last["end"] = None
                last["seen"] = now
                last["count"] = last.get("count", 1) + 1
                self._save()
                return None
            event = {"id": f"{int(now)}-{secrets.token_hex(3)}", "camera": camera_id, "start": now, "seen": now, "end": None, "count": 1, "photo": False}
            self.events.append(event)
            self._save()
            return dict(event)

    def close_open(self):
        """Conexão caiu: o DVR não vai mandar o "Stop" dos eventos em andamento; fecha-os."""
        with self.lock:
            changed = False
            for event in self.events:
                if event.get("end") is None:
                    event["end"] = event.get("seen", event["start"])
                    changed = True
            if changed:
                self._save()

    def _snapshot(self, event):
        if not self.snapshots.acquire(blocking=False):
            return
        try:
            # Reaproveita a imagem recente do cache da grade; só pede uma nova se for velha.
            data, age = self.cameras.recent(event["camera"])
            if not data or age > 15:
                data = self.cameras._fetch(event["camera"])
            self.dir.mkdir(parents=True, exist_ok=True)
            (self.dir / f"{event['id']}.jpg").write_bytes(data)
            with self.lock:
                for stored in self.events:
                    if stored["id"] == event["id"]:
                        stored["photo"] = True
                self._save()
        except (AppError, OSError):
            pass
        finally:
            self.snapshots.release()

    def _listen(self):
        source = self.source()
        if not source:
            self.last_error = "Sem DVR configurado no go2rtc deste PC."
            self.stop_event.wait(300)
            return
        host, user, password = source
        base = f"http://{host}"
        manager = urllib.request.HTTPPasswordMgrWithDefaultRealm()
        manager.add_password(None, base, user, password)
        opener = urllib.request.build_opener(urllib.request.HTTPDigestAuthHandler(manager), urllib.request.HTTPBasicAuthHandler(manager))
        try:
            response = opener.open(f"{base}/cgi-bin/eventManager.cgi?action=attach&codes=[VideoMotion]&heartbeat=5", timeout=20)
        except Exception as error:
            self.connected, self.last_error = False, "DVR não respondeu ao pedido de eventos." if not isinstance(error, urllib.error.HTTPError) else f"DVR recusou ({error.code})."
            return
        self.connected, self.last_error = True, None
        try:
            while not self.stop_event.is_set():
                raw = response.readline()
                if not raw:
                    break
                self.last_line = self.clock()
                event = self.handle(raw.decode("utf-8", "replace"))
                if event:
                    threading.Thread(target=self._snapshot, args=(event,), daemon=True).start()
        except Exception:
            self.last_error = "Conexão de eventos caiu; reconectando."
        finally:
            self.connected = False
            self.close_open()
            response.close()

    def start(self):
        if self.thread is not None:
            return

        def loop():
            delay = 5
            while not self.stop_event.is_set():
                started = self.clock()
                self._listen()
                delay = 5 if self.clock() - started > 60 else min(delay * 2, 120)
                self.stop_event.wait(delay)

        self.thread = threading.Thread(target=loop, daemon=True, name="casa-movimento")
        self.thread.start()

    def close(self):
        self.stop_event.set()

    # ---- painel ----
    def status(self, hours=24, camera=None):
        """Eventos das últimas `hours` horas, mais novos primeiro. Com `camera`, só os dessa câmera
        (o filtro é aqui: câmeras quietas não somem atrás das movimentadas)."""
        if camera is not None and camera not in IDS:
            raise AppError("Câmera não encontrada.", 404, "not_found")
        with self.lock:
            since = self.clock() - hours * 3600
            events = [dict(e) for e in self.events if e["start"] >= since and (camera is None or e["camera"] == camera)][-LIST_LIMIT:][::-1]
            unseen = sum(1 for e in self.events if e["start"] > self.seen_at and e["camera"] in self.notify)
            return {"connected": self.connected, "error": self.last_error, "events": events, "notify": sorted(self.notify),
                    "unseen": unseen, "seenAt": self.seen_at}

    def set_notify(self, body):
        if not isinstance(body, dict) or set(body) != {"camera", "on"} or body["camera"] not in IDS or type(body["on"]) is not bool:
            raise AppError("Pedido inválido.")
        with self.lock:
            (self.notify.add if body["on"] else self.notify.discard)(body["camera"])
            self._save()
        return self.status()

    def mark_seen(self):
        with self.lock:
            self.seen_at = self.clock()
            self._save()
        return self.status()

    def photo(self, event_id):
        if not re.fullmatch(r"\d{9,11}-[0-9a-f]{6}", event_id or ""):
            raise AppError("Foto não encontrada.", 404, "not_found")
        try:
            return (self.dir / f"{event_id}.jpg").read_bytes()
        except OSError:
            raise AppError("Foto não encontrada.", 404, "not_found") from None
