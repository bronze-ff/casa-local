"""Read-only camera bridge to a local go2rtc; DVR credentials live only in go2rtc."""
import http.client
import os
import re
import socket
import threading
import time
from urllib.parse import urlsplit

from .models import AppError

CAMERAS = [
    {"id": "cam1", "name": "Rua · muro", "group": "externa"},
    {"id": "cam2", "name": "Calçada · portão", "group": "externa"},
    {"id": "cam3", "name": "Calçada lateral", "group": "externa"},
    {"id": "cam4", "name": "Jardim da frente", "group": "externa"},
    {"id": "cam6", "name": "Garagem", "group": "externa"},
    {"id": "cam7", "name": "Jardim lateral", "group": "externa"},
    {"id": "cam8", "name": "Rua · vista alta", "group": "externa"},
    {"id": "cam9", "name": "Palmeiras", "group": "externa"},
    {"id": "cam5", "name": "Entrada", "group": "interna"},
    {"id": "cam11", "name": "Varanda", "group": "interna"},
    {"id": "cam12", "name": "Área coberta", "group": "interna"},
    {"id": "cam13", "name": "Corredor lateral", "group": "interna"},
    {"id": "cam14", "name": "Sala de jantar", "group": "interna"},
    {"id": "cam15", "name": "Cozinha", "group": "interna"},
    {"id": "cam16", "name": "Lavanderia", "group": "interna"},
]
IDS = {camera["id"] for camera in CAMERAS}
MAX_FRAME = 4 * 1024 * 1024
LIVE_SECONDS = 600
CACHE_WORKERS = 5  # ~1-2 s de espera por quadro-chave cada; CPU de verdade é pequena (decodifica um quadro D1)
# go2rtc decodes one keyframe with ffmpeg per snapshot (~1-2 s each), so snapshots are refreshed
# in the background and served from memory: fast while someone is looking, slow when idle.
ACTIVE_REFRESH, IDLE_REFRESH, VIEWER_WINDOW, MAX_SERVED_AGE = 4, 120, 30, 300


class CameraBridge:
    def __init__(self, base_url=None):
        target = urlsplit(base_url or os.environ.get("CASA_GO2RTC", "http://127.0.0.1:1984"))
        # go2rtc exposes its whole API (including config with DVR credentials); only loopback is accepted.
        if target.scheme != "http" or target.hostname not in {"127.0.0.1", "localhost", "::1"} or target.path not in {"", "/"}:
            raise ValueError("CASA_GO2RTC precisa apontar para o go2rtc local (http://127.0.0.1:porta).")
        self.host, self.port = target.hostname, target.port or 80
        self.frames = threading.BoundedSemaphore(3)
        self.live = threading.BoundedSemaphore(3)
        self.cache = {}  # camera id -> (jpeg, monotonic time captured)
        self.attempted = {}  # camera id -> monotonic time of the last background attempt
        self.in_flight = set()
        self.cache_lock = threading.Lock()
        self.last_viewer = 0.0
        self.stop_event = threading.Event()
        self.workers = []

    def _next_due(self):
        interval = ACTIVE_REFRESH if time.monotonic() - self.last_viewer < VIEWER_WINDOW else IDLE_REFRESH
        now = time.monotonic()
        with self.cache_lock:
            waiting = [(now - self.attempted.get(c["id"], -1e9), c["id"]) for c in CAMERAS if c["id"] not in self.in_flight]
            if not waiting:
                return None
            age, camera_id = max(waiting)
            if age < interval:
                return None
            self.in_flight.add(camera_id)
            self.attempted[camera_id] = now
            return camera_id

    def start(self):
        if self.workers:
            return

        def worker():
            while not self.stop_event.is_set():
                camera_id = self._next_due()
                if camera_id is None:
                    self.stop_event.wait(0.5)
                    continue
                try:
                    self._store(camera_id, self._fetch(camera_id))
                except AppError:
                    self.stop_event.wait(1)
                finally:
                    with self.cache_lock:
                        self.in_flight.discard(camera_id)

        for index in range(CACHE_WORKERS):
            thread = threading.Thread(target=worker, daemon=True, name=f"casa-camera-cache-{index}")
            thread.start()
            self.workers.append(thread)

    def close(self):
        self.stop_event.set()

    def _store(self, camera_id, data):
        with self.cache_lock:
            self.cache[camera_id] = (data, time.monotonic())

    def _open(self, path, timeout):
        connection = http.client.HTTPConnection(self.host, self.port, timeout=timeout)
        try:
            connection.request("GET", path, headers={"Host": f"{self.host}:{self.port}"})
            return connection, connection.getresponse()
        except OSError:
            connection.close()
            raise AppError("O serviço de câmeras não está rodando no PC de casa.", 503, "cameras_unavailable") from None

    def available(self):
        try:
            connection, response = self._open("/api", 2)
        except AppError:
            return False
        try:
            response.read(4096)
            return response.status == 200
        finally:
            connection.close()

    def snapshot(self):
        # Status checks (tray icons poll this) must not count as someone watching: only frame requests do.
        return {"available": self.available(), "cameras": [dict(camera) for camera in CAMERAS]}

    @staticmethod
    def _check(camera_id):
        if camera_id not in IDS:
            raise AppError("Câmera não encontrada.", 404, "not_found")

    def recent(self, camera_id):
        """Última imagem em cache e a idade em segundos, sem contar como alguém assistindo."""
        with self.cache_lock:
            data, stamp = self.cache.get(camera_id, (b"", -1e9))
        return data, time.monotonic() - stamp

    def frame(self, camera_id):
        """Return (jpeg, age_seconds); served from the background cache when fresh enough."""
        self._check(camera_id)
        self.last_viewer = time.monotonic()
        with self.cache_lock:
            data, stamp = self.cache.get(camera_id, (b"", -1e9))
        age = time.monotonic() - stamp
        if data and age <= MAX_SERVED_AGE:
            return data, age
        data = self._fetch(camera_id)
        self._store(camera_id, data)
        return data, 0.0

    def _fetch(self, camera_id):
        if not self.frames.acquire(timeout=6):
            raise AppError("Muitas imagens ao mesmo tempo.", 429, "busy")
        try:
            connection, response = self._open(f"/api/frame.jpeg?src={camera_id}", 7)
            try:
                if response.status != 200 or response.getheader("Content-Type", "").split(";")[0] != "image/jpeg":
                    raise AppError("A câmera não enviou imagem.", 502, "camera_no_frame")
                data = response.read(MAX_FRAME + 1)
                if not data or len(data) > MAX_FRAME:
                    raise AppError("A câmera não enviou imagem.", 502, "camera_no_frame")
                return data
            finally:
                connection.close()
        finally:
            self.frames.release()

    def open_ws(self, camera_id, key):
        """Open go2rtc's MSE WebSocket for a camera's main stream (camN_hd, H264 passthrough).

        The DVR substream runs at 3 fps; the main stream (~12 fps) is what makes live view fluid.

        Returns (release, upstream_socket, handshake_bytes); the caller relays raw bytes both ways.
        """
        self._check(camera_id)
        if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9+/]{22}==", key):
            raise AppError("Pedido de vídeo inválido.", 400, "invalid_request")
        if not self.live.acquire(blocking=False):
            raise AppError("Já existem transmissões ao vivo abertas. Feche uma e tente de novo.", 429, "busy")
        upstream = None
        try:
            upstream = socket.create_connection((self.host, self.port), timeout=10)
            upstream.sendall((
                f"GET /api/ws?src={camera_id}_hd HTTP/1.1\r\nHost: {self.host}:{self.port}\r\n"
                f"Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
            ).encode("ascii"))
            head = b""
            while b"\r\n\r\n" not in head:
                chunk = upstream.recv(4096)
                if not chunk or len(head) > 16384:
                    raise OSError
                head += chunk
            if not head.startswith(b"HTTP/1.1 101"):
                raise AppError("A câmera não iniciou a transmissão.", 502, "camera_no_stream")
        except OSError:
            if upstream:
                upstream.close()
            self.live.release()
            raise AppError("O serviço de câmeras não está rodando no PC de casa.", 503, "cameras_unavailable") from None
        except BaseException:
            if upstream:
                upstream.close()
            self.live.release()
            raise

        def release():
            upstream.close()
            self.live.release()
        return release, upstream, head

    def open_live(self, camera_id):
        """Return (release, response) for an MJPEG stream; caller must call release()."""
        self._check(camera_id)
        if not self.live.acquire(blocking=False):
            raise AppError("Já existem transmissões ao vivo abertas. Feche uma e tente de novo.", 429, "busy")
        try:
            # camN_live is defined in go2rtc.yaml as ffmpeg:camN#video=mjpeg (the DVR only sends H264).
            # Starting ffmpeg and waiting for a keyframe takes ~8-10 s on the home PC.
            connection, response = self._open(f"/api/stream.mjpeg?src={camera_id}_live", 20)
            if response.status != 200 or not response.getheader("Content-Type", "").startswith("multipart/"):
                connection.close()
                raise AppError("A câmera não iniciou a transmissão.", 502, "camera_no_stream")
        except BaseException:
            self.live.release()
            raise

        def release():
            connection.close()
            self.live.release()
        return release, response
