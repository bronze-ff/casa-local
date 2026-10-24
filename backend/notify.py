"""Avisos no celular pelo ntfy (no home lab, em http://127.0.0.1:2586).

Tópicos (assine cada um no app ntfy do iPhone; dá para silenciar um sem perder os outros):
- cameras: movimento do DVR nas câmeras com sino (foto e link para a gravação). Nas câmeras que o
  Frigate vigia, com ele ligado, o DVR não avisa: quem avisa é o Frigate, que ignora bicho e bandeira;
- pessoas: o Frigate viu pessoa (ou também carro e animal, se escolhido) numa câmera com sino, com o
  nome se reconheceu o rosto;
- sistema: algo da Central falhou ou voltou, serviço do home lab parou, disco ou GPU no limite;
- casa: chegadas e saídas, e rotinas que rodaram (ou falharam).

Modo ausente: com a localização dizendo que você está em casa, câmera e pessoas chegam sem som
(prioridade baixa); fora de casa, com som e destaque.
Tudo é enviado por uma fila em segundo plano; se o ntfy estiver fora, o aviso é descartado.
"""
import base64
import json
from pathlib import Path
import queue
import re
import threading
import time
import urllib.error
import urllib.request

from .cameras import CAMERAS
from .models import AppError

TOPICS = {"cameras": "casa-cameras", "pessoas": "casa-pessoas", "sistema": "casa-sistema", "casa": "casa-casa"}
HOME_NAMES = {"casa", "home", "minha casa", "casa local"}
FRIGATE = "http://127.0.0.1:5000"
FRIGATE_LABELS = {"person": "Pessoa", "car": "Carro", "motorcycle": "Moto", "bicycle": "Bicicleta", "dog": "Cachorro", "cat": "Gato"}
# O que o Frigate avisa: só pessoas, ou também veículos e animais.
FRIGATE_KINDS = {"pessoas": {"person"}, "tudo": set(FRIGATE_LABELS)}
NAMES = {c["id"]: c["name"] for c in CAMERAS}


def _encode(value):
    """Cabeçalhos HTTP são ASCII: o ntfy aceita UTF-8 no formato RFC 2047."""
    return value if value.isascii() else "=?UTF-8?B?" + base64.b64encode(value.encode()).decode() + "?="


def http_send(server, topic, title, message, priority=3, tags=(), click=None, attach=None, filename=None, timeout=15):
    if attach:
        headers = {"X-Title": _encode(title), "X-Message": _encode(message), "X-Priority": str(priority), "X-Filename": filename or "foto.jpg"}
        if tags:
            headers["X-Tags"] = ",".join(tags)
        if click:
            headers["X-Click"] = click
        request = urllib.request.Request(f"{server}/{topic}", data=attach, method="PUT", headers=headers)
    else:
        body = {"topic": topic, "title": title, "message": message, "priority": priority, "tags": list(tags)}
        if click:
            body["click"] = click
        request = urllib.request.Request(server + "/", data=json.dumps(body).encode(), method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.status


class Notifier:
    def __init__(self, data_dir, host=lambda: None, presence=lambda: None, clock=time.time, sender=http_send, fetch=None, watched=lambda: set()):
        """host(): nome do PC no Tailscale (links); presence(): True em casa, False fora, None sem saber;
        watched(): câmeras com sino."""
        self.watched = watched
        self.path = Path(data_dir) / "notificacoes.json"
        self.host, self.presence, self.clock, self.sender = host, presence, clock, sender
        self.fetch = fetch or self._fetch
        self.lock = threading.Lock()
        self.queue = queue.Queue(maxsize=200)
        self.stop_event = threading.Event()
        self.threads = []
        try:
            saved = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            saved = {}
        self.server = saved.get("server", "http://127.0.0.1:2586") if isinstance(saved.get("server"), str) else "http://127.0.0.1:2586"
        self.enabled = {k: saved.get("enabled", {}).get(k, True) is True for k in TOPICS} if isinstance(saved.get("enabled"), dict) else dict.fromkeys(TOPICS, True)
        self.camera_scope = saved.get("cameraScope", "watched") if saved.get("cameraScope") in {"watched", "all"} else "watched"
        self.frigate_kinds = saved.get("frigateKinds", "pessoas") if saved.get("frigateKinds") in FRIGATE_KINDS else "pessoas"
        self.frigate_cameras, self.frigate_cameras_at = set(), 0
        self.sent, self.failed, self.last_error = 0, 0, None
        self.health_states, self.lab_states = {}, {}
        self.frigate_seen, self.frigate_after, self.frigate_ok = {}, clock() - 60, None

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"server": self.server, "enabled": self.enabled, "cameraScope": self.camera_scope, "frigateKinds": self.frigate_kinds}), encoding="utf-8")
        temporary.replace(self.path)

    # ---- painel ----
    def status(self):
        with self.lock:
            host = self.host()
            return {"enabled": dict(self.enabled), "cameraScope": self.camera_scope, "frigateKinds": self.frigate_kinds,
                    "frigateCameras": sorted(self.frigate_cameras), "topics": dict(TOPICS),
                    "subscribe": f"https://{host}:10000" if host else None, "sent": self.sent, "failed": self.failed,
                    "lastError": self.last_error, "frigate": self.frigate_ok, "home": self.presence()}

    def configure(self, body):
        if not isinstance(body, dict) or not body or not set(body) <= {"enabled", "cameraScope", "frigateKinds"}:
            raise AppError("Ajuste inválido.")
        with self.lock:
            if "enabled" in body:
                values = body["enabled"]
                if not isinstance(values, dict) or not set(values) <= set(TOPICS) or any(type(v) is not bool for v in values.values()):
                    raise AppError("Ajuste inválido.")
                self.enabled.update(values)
            if "cameraScope" in body:
                if body["cameraScope"] not in {"watched", "all"}:
                    raise AppError("Ajuste inválido.")
                self.camera_scope = body["cameraScope"]
            if "frigateKinds" in body:
                if body["frigateKinds"] not in FRIGATE_KINDS:
                    raise AppError("Ajuste inválido.")
                self.frigate_kinds = body["frigateKinds"]
            self._save()
        return self.status()

    def test(self):
        for kind in TOPICS:
            self.push(kind, "Casa · teste de aviso", f"Tópico {TOPICS[kind]} chegando neste celular.", priority=3, tags=["white_check_mark"], force=True)
        return self.status()

    # ---- envio ----
    def push(self, kind, title, message, priority=3, tags=(), click=None, attach=None, filename=None, force=False):
        if not force and not self.enabled.get(kind):
            return False
        try:
            self.queue.put_nowait((TOPICS[kind], title, message, priority, tuple(tags), click, attach, filename))
            return True
        except queue.Full:
            return False

    def _drain(self):
        while not self.stop_event.is_set():
            try:
                item = self.queue.get(timeout=1)
            except queue.Empty:
                continue
            try:
                self.sender(self.server, *item)
                with self.lock:
                    self.sent += 1
                    self.last_error = None
            except (OSError, urllib.error.URLError, ValueError) as error:
                with self.lock:
                    self.failed += 1
                    self.last_error = str(error)[:200]

    def _link(self, fragment):
        host = self.host()
        return f"https://{host}/#{fragment}" if host else None

    def _priority(self, normal_away=4):
        """Em casa: sem som (2). Fora ou sem saber: com destaque."""
        return 2 if self.presence() is True else normal_away

    # ---- fontes ----
    def on_motion(self, event, watched, photo=None):
        """Evento novo do DVR (depois da tentativa de foto)."""
        if self.camera_scope == "watched" and event["camera"] not in watched:
            return
        if self.frigate_ok and event["camera"] in self.frigate_cameras:
            return  # o Frigate vigia esta câmera e avisa só se for pessoa
        name = NAMES.get(event["camera"], event["camera"])
        when = time.strftime("%H:%M:%S", time.localtime(event["start"]))
        self.push("cameras", f"Movimento · {name}", f"Às {when}. Toque para ver a gravação.", priority=self._priority(), tags=["rotating_light"],
                  click=self._link(f"cameras:replay:{event['camera']}:{int(event['start'])}"), attach=photo, filename=f"{event['camera']}.jpg")

    def on_location(self, event, places):
        name = places.get(event.get("place"), "um lugar")
        verb = "chegou em" if event.get("kind") == "chegou" else "saiu de"
        who = event.get("name") or "Alguém"
        self.push("casa", f"{who} {verb} {name}", time.strftime("às %H:%M", time.localtime(event["tst"])), priority=2, tags=["round_pushpin"])

    def on_routine(self, name, ok, message):
        self.push("casa", f"Rotina {name}", message, priority=2 if ok else 4, tags=["white_check_mark"] if ok else ["warning"])

    def check_health(self, report):
        """Avisa quando uma verificação da Central passa a falhar e quando volta."""
        for check in report.get("checks", []):
            before = self.health_states.get(check["id"])
            self.health_states[check["id"]] = check["state"]
            if before is None or before == check["state"]:
                continue
            if check["state"] == "fail":
                self.push("sistema", f"Falhou: {check['label']}", check["detail"], priority=4, tags=["warning"], click=self._link("central"))
            elif before == "fail":
                self.push("sistema", f"Voltou: {check['label']}", check["detail"], priority=2, tags=["white_check_mark"])

    def check_lab(self, lab):
        """Serviço do home lab que parou fora do modo jogo, disco quase cheio, GPU quente."""
        stable = lab.get("mode") == "lab" and not lab.get("step")
        for service in lab.get("services", []):
            if service["id"] == "frigate" and not lab.get("frigateOn"):
                continue  # desligado de propósito (você em casa, ou "nunca")
            state = service["state"]
            if state == "unknown":
                continue  # leitura falhou: não é parada, e o estado anterior continua valendo
            before = self.lab_states.get(service["id"])
            self.lab_states[service["id"]] = state
            if not stable or before is None or before == state:
                continue
            if before == "running":
                self.push("sistema", f"Parou: {service['name']}", f"{service['purpose']} · {service.get('status') or state}", priority=4, tags=["warning"], click=self._link("lab"))
            elif state == "running":
                self.push("sistema", f"Voltou: {service['name']}", service["purpose"], priority=2, tags=["white_check_mark"])
        stats = lab.get("stats") or {}
        for disk in stats.get("disks") or []:
            self._threshold(f"disk-{disk['drive']}", disk["freeGb"] < (10 if disk["drive"] == "C" else 20),
                            f"Disco {disk['drive']}: quase cheio", f"{disk['freeGb']} GB livres de {disk['totalGb']} GB.")
        gpu = stats.get("gpu") or {}
        if gpu.get("temp") is not None:
            self._threshold("gpu", gpu["temp"] >= 85, "Placa de vídeo quente", f"{gpu['temp']:.0f} °C agora.")

    def _threshold(self, key, over, title, message):
        before = self.health_states.get(key)
        self.health_states[key] = over
        if over and before is False:
            self.push("sistema", title, message, priority=4, tags=["warning"], click=self._link("lab"))

    # ---- Frigate (pessoas e rostos) ----
    def _fetch(self, path, timeout=10):
        with urllib.request.urlopen(FRIGATE + path, timeout=timeout) as response:
            return response.read()

    def poll_frigate(self, dvr_offset=0.0):
        """Eventos novos do Frigate: avisa uma vez cada um, depois de ~4 s (tempo de reconhecer o rosto)."""
        try:
            if self.clock() - self.frigate_cameras_at > 300 or not self.frigate_cameras:
                self.frigate_cameras = set(json.loads(self.fetch("/api/config")).get("cameras", {}))
                self.frigate_cameras_at = self.clock()
            events = json.loads(self.fetch(f"/api/events?after={self.frigate_after - 30:.0f}&limit=50&include_thumbnails=0"))
            self.frigate_ok = True
        except (OSError, ValueError):
            self.frigate_ok = False  # parado (modo jogo) ou subindo
            return
        # Tópico de pessoas desligado: a saúde acima já basta. Sem isso o DVR continuaria
        # calado nas câmeras do Frigate depois que o container para.
        if not self.enabled.get("pessoas"):
            return
        now = self.clock()
        allowed = FRIGATE_KINDS[self.frigate_kinds]
        watched = self.watched()
        for event in events:
            event_id = event.get("id")
            if not event_id or event_id in self.frigate_seen or event.get("label") not in allowed:
                continue
            start = event.get("start_time") or now
            if self.camera_scope == "watched" and event.get("camera") not in watched:
                self.frigate_seen[event_id] = start  # câmera sem sino: não avisa
                self.frigate_after = max(self.frigate_after, start)
                continue
            sub = event.get("sub_label")
            person = sub[0] if isinstance(sub, list) and sub else sub if isinstance(sub, str) else None
            if not person and now - start < 4:
                continue  # ainda pode reconhecer o rosto
            self.frigate_seen[event_id] = start
            self.frigate_after = max(self.frigate_after, start)
            camera = event.get("camera", "")
            name = NAMES.get(camera, camera)
            label = FRIGATE_LABELS[event["label"]]
            title = f"{person} em {name}" if person else f"{label} em {name}"
            when = time.strftime("%H:%M:%S", time.localtime(start))
            photo = None
            if event.get("has_snapshot"):
                try:
                    photo = self.fetch(f"/api/events/{event_id}/snapshot.jpg?bbox=1&h=540")
                except OSError:
                    photo = None
            # Rosto conhecido com você em casa: quase sem barulho.
            priority = 1 if person and self.presence() is True else self._priority(5 if event["label"] == "person" else 4)
            link = self._link(f"cameras:replay:{camera}:{int(start + dvr_offset)}") if re.fullmatch(r"cam\d{1,2}", camera) else None
            self.push("pessoas", title, f"Às {when}" + (f" · {label.lower()} reconhecida" if person else "") + ". Toque para ver a gravação.",
                      priority=priority, tags=["bust_in_silhouette" if event["label"] == "person" else "red_car"], click=link, attach=photo, filename=f"{camera}.jpg")
        # A consulta pede `after = cursor - 30`, então o último evento continua voltando
        # enquanto nada mais novo empurra o cursor. Esquecer o id pela idade o reenviaria.
        horizon = self.frigate_after - 30
        for event_id, start in list(self.frigate_seen.items()):
            if start <= horizon:
                del self.frigate_seen[event_id]

    # ---- ciclo ----
    def _watch(self, health, lab, offset, minute):
        """Uma volta. O Frigate é sondado mesmo com o tópico de pessoas desligado."""
        self.poll_frigate(offset())
        if minute:
            if health:
                self.check_health(health())
            if lab:
                self.check_lab(lab())

    def start(self, health=None, lab=None, offset=lambda: 0.0):
        if self.threads:
            return
        sender = threading.Thread(target=self._drain, daemon=True, name="casa-avisos")
        sender.start()

        def watch():
            ticks = 0
            while not self.stop_event.wait(5):
                ticks += 1
                try:
                    self._watch(health, lab, offset, ticks % 12 == 0)
                except Exception:
                    pass

        watcher = threading.Thread(target=watch, daemon=True, name="casa-avisos-vigia")
        watcher.start()
        self.threads = [sender, watcher]

    def close(self):
        self.stop_event.set()
