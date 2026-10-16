"""Replay das gravações do próprio DVR (sem gravar nada neste PC).

O DVR Intelbras/Dahua entrega a gravação de qualquer horário pelo RTSP de playback
(/cam/playback?channel=N&starttime=AAAA_MM_DD_HH_MM_SS&endtime=...). O servidor registra esse
endereço como um stream temporário no go2rtc local (a senha vem do go2rtc.yaml e nunca vai para o
navegador) e o painel assiste pelo mesmo WebSocket do ao vivo. Cada replay dura até 15 min e é
apagado ao fechar; no máximo dois ao mesmo tempo, para não pesar no DVR.
"""
from datetime import datetime
import http.client
import re
import secrets
import threading
import time
from urllib.parse import quote, urlencode

from .cameras import IDS
from .models import AppError
from .motion import dvr_source

WINDOW = 15 * 60       # quanto da gravação cada replay pede a partir do início
LIFETIME = WINDOW + 120  # depois da conexão do painel (janela + 60 s): só some quem já terminou
MAX_ACTIVE = 2
MAX_AGE_DAYS = 30


def _dvr_time(moment):
    return datetime.fromtimestamp(moment).strftime("%Y_%m_%d_%H_%M_%S")  # o DVR usa a hora local


class Replays:
    def __init__(self, cameras, source=dvr_source, clock=time.time):
        self.cameras, self.source, self.clock = cameras, source, clock
        self.lock = threading.Lock()
        self.active = {}  # id -> {"camera", "start", "created"}

    def _go2rtc(self, method, query):
        connection = http.client.HTTPConnection(self.cameras.host, self.cameras.port, timeout=10)
        try:
            connection.request(method, f"/api/streams?{urlencode(query)}", headers={"Host": f"{self.cameras.host}:{self.cameras.port}"})
            response = connection.getresponse()
            response.read(65536)
            return response.status
        except OSError:
            raise AppError("O serviço de câmeras não está rodando no PC de casa.", 503, "cameras_unavailable") from None
        finally:
            connection.close()

    def _expire(self):
        now = self.clock()
        for replay_id, item in list(self.active.items()):
            if now - item["created"] > LIFETIME:
                self._remove(replay_id)

    def _remove(self, replay_id):
        self.active.pop(replay_id, None)
        try:
            self._go2rtc("DELETE", {"src": f"replay_{replay_id}"})
        except AppError:
            pass

    def open(self, camera_id, body):
        if camera_id not in IDS:
            raise AppError("Câmera não encontrada.", 404, "not_found")
        if not isinstance(body, dict) or not {"start"} <= set(body) <= {"start", "replace"} or type(body["start"]) not in (int, float):
            raise AppError("Informe o horário do replay.")
        replace = body.get("replace")
        if replace is not None and not (isinstance(replace, str) and re.fullmatch(r"[0-9a-f]{12}", replace)):
            raise AppError("Replay inválido.")
        now = self.clock()
        start = int(body["start"])
        if start > now - 5:
            raise AppError("Esse horário ainda não foi gravado. Use o ao vivo.", 409, "replay_future")
        if start < now - MAX_AGE_DAYS * 86400:
            raise AppError(f"O replay vai até {MAX_AGE_DAYS} dias atrás.", 409, "replay_too_old")
        source = self.source()
        if not source:
            raise AppError("Sem DVR configurado no go2rtc deste PC.", 503, "cameras_unavailable")
        host, user, password = source
        channel = int(camera_id.removeprefix("cam"))
        url = (f"rtsp://{quote(user, safe='')}:{quote(password, safe='')}@{host}:554/cam/playback?channel={channel}&subtype=0"
               f"&starttime={_dvr_time(start)}&endtime={_dvr_time(min(start + WINDOW, now))}")
        with self.lock:
            self._expire()
            if replace in self.active:
                self._remove(replace)  # voltar/avançar troca o replay anterior pelo novo numa chamada só
            if len(self.active) >= MAX_ACTIVE:
                oldest = min(self.active, key=lambda key: self.active[key]["created"])
                self._remove(oldest)
            replay_id = secrets.token_hex(6)
            if self._go2rtc("PUT", {"name": f"replay_{replay_id}", "src": url}) != 200:
                raise AppError("O DVR não abriu a gravação desse horário.", 502, "camera_no_stream")
            self.active[replay_id] = {"camera": camera_id, "start": start, "created": now}
        return {"id": replay_id, "camera": camera_id, "start": start}

    def stream(self, replay_id):
        """Nome do stream no go2rtc para o WebSocket do painel."""
        with self.lock:
            if not re.fullmatch(r"[0-9a-f]{12}", replay_id or "") or replay_id not in self.active:
                raise AppError("Replay encerrado. Abra de novo.", 404, "not_found")
            return f"replay_{replay_id}"

    def close(self, replay_id):
        with self.lock:
            if replay_id in self.active:
                self._remove(replay_id)
        return {"closed": True}

    def close_all(self):
        with self.lock:
            for replay_id in list(self.active):
                self._remove(replay_id)
