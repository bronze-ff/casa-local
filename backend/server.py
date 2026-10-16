"""Private HTTP boundary and allowlisted built-asset serving."""
import argparse
from collections import defaultdict, deque
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import mimetypes
import os
from pathlib import Path
import re
import select
import socket
import threading
import time
from urllib.parse import unquote, urlsplit

from .app import CasaApp
from .cameras import LIVE_SECONDS, CameraBridge
from .config import ROOT, private_ip
from .energy import AcUsage
from .health import Backups, report as health_report
from .location import LocationStore
from .motion import MotionWatcher
from .replay import WINDOW as REPLAY_WINDOW, Replays
from .routines import Routines
from .samsung_tv import SamsungTVs
from .models import AppError, VERSION

MAX_BODY = 16384
CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'{ws}; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"


def local_hosts(extra=None):
    hosts = {"localhost", "127.0.0.1", "::1"}
    for name in {socket.gethostname(), socket.getfqdn()}:
        hosts.add(name.lower().rstrip("."))
        try:
            for info in socket.getaddrinfo(name, None):
                ip = info[4][0]
                if private_ip(ip):
                    hosts.add(ip)
        except OSError:
            pass
    for value in extra or []:
        value = value.strip().lower()
        if not value:
            continue
        if value in {"*", "0.0.0.0", "::"} or "/" in value or "://" in value:
            raise ValueError("CASA_ALLOWED_HOSTS exige nomes ou IPs exatos, sem esquema ou porta.")
        try:
            ipaddress.ip_address(value)
        except ValueError:
            if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?", value):
                raise ValueError("Host adicional inválido.") from None
        hosts.add(value)
    return hosts


class CasaServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, app, dist_dir=None, allowed_hosts=None, cameras=None, location=None):
        self.app = app
        self.cameras = cameras or CameraBridge()
        # Na prévia nada físico acontece e nada real muda: os serviços da Central e a localização
        # usam .data/previa (rotinas, gasto, movimento, TVs, lugares), as rotinas não executam, o ar
        # simulado não conta no gasto e as TVs recusam comandos, pareamento e varredura.
        local = app.mode == "local"
        store = app.data_dir if local else app.data_dir / "previa"
        self.location = location or LocationStore(store)
        self.started = time.time()
        self.routines = Routines(app, store)
        self.energy = AcUsage(store)
        if local:
            app.listeners.append(lambda device_id, state: self.energy.observe(state.get("power")) if device_id == "ar-quarto" else None)
        self.motion = MotionWatcher(self.cameras, store)
        self.tvs = SamsungTVs(store, preview=not local)
        self.replays = Replays(self.cameras, offset=lambda: self.motion.offset)
        self.backups = Backups(app.data_dir)
        self.background = threading.Event()
        self.dist_dir = Path(dist_dir or ROOT / "dist").resolve()
        self.allowed_hosts = local_hosts(allowed_hosts)
        self.slots = threading.BoundedSemaphore(16)
        self.rate_lock = threading.Lock()
        self.rates = defaultdict(deque)
        super().__init__(address, CasaHandler)
        self.app.start_polling()

    def start_background(self):
        """Serviços de fundo do PC de casa (não sobem nos testes): rotinas, DVR, TVs, backup."""
        if self.app.mode == "local":
            self.routines.start()
            self.motion.start()
            self.tvs.start(self.background)
            self.backups.start(self.background)

    def server_close(self):
        self.background.set()
        self.routines.close()
        self.motion.close()
        self.replays.close_all()
        self.app.close()
        self.cameras.close()
        super().server_close()

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()

    def handle_error(self, request, client_address):
        # Never dump exceptions, payloads, addresses, or keys to a request log.
        pass


class CasaHandler(BaseHTTPRequestHandler):
    server_version = "CasaLocal"
    sys_version = ""
    protocol_version = "HTTP/1.0"

    def setup(self):
        super().setup()
        self.connection.settimeout(8)

    def log_message(self, *args):
        pass

    def send_error(self, code, message=None, explain=None):
        self.json_response(code, {"error": "Solicitação não permitida.", "code": "request_rejected"})

    def end_headers(self):
        # Older Safari does not match ws:/wss: with 'self'; name the (already validated) host explicitly.
        host = self.headers.get("Host", "") if getattr(self, "headers", None) else ""
        ws = f" ws://{host} wss://{host}" if re.fullmatch(r"[A-Za-z0-9.-]+(:[0-9]{1,5})?", host or "") else ""
        self.send_header("Content-Security-Policy", CSP.format(ws=ws))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def json_response(self, status, data):
        encoded = json.dumps(data, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(encoded)

    def guard(self, mutation=False, phone=False):
        if not private_ip(self.client_address[0]):
            raise AppError("Acesso restrito à rede privada.", 403, "private_network_only")
        hosts = self.headers.get_all("Host", [])
        if len(hosts) != 1 or not hosts[0] or any(x in hosts[0] for x in "/\\@?# \t\r\n"):
            raise AppError("Host não permitido.", 403, "invalid_host")
        try:
            parsed = urlsplit("http://" + hosts[0])
            hostname = parsed.hostname
            port = parsed.port
            if hostname not in self.server.allowed_hosts or (port is not None and not 1 <= port <= 65535):
                raise ValueError
        except ValueError:
            raise AppError("Host não permitido.", 403, "invalid_host") from None
        # Pelo Tailscale Serve (.ts.net) o celular dela também chega aqui: com a localização
        # preparada, só o dono da tailnet vê o painel; os demais só podem enviar a posição.
        # O Serve preenche Tailscale-User-Login e descarta o valor que vier do cliente.
        owner = self.server.location.owner
        if owner and hostname.endswith(".ts.net") and not phone:
            logins = self.headers.get_all("Tailscale-User-Login", [])
            if len(logins) != 1 or logins[0].strip().lower() != owner:
                raise AppError("Este acesso só envia a localização.", 403, "owner_only")
        origins = self.headers.get_all("Origin", [])
        if len(origins) > 1:
            raise AppError("Origem não permitida.", 403, "invalid_origin")
        if origins:
            try:
                origin = urlsplit(origins[0])
                if origin.scheme not in {"http", "https"} or origin.netloc.lower() != hosts[0].lower() or origin.path or origin.query or origin.fragment:
                    raise ValueError
            except ValueError:
                raise AppError("Origem não permitida.", 403, "invalid_origin") from None
        if self.headers.get("Sec-Fetch-Site", "") == "cross-site":
            raise AppError("Solicitação de outro site bloqueada.", 403, "cross_site")
        if mutation:
            tokens = self.headers.get_all("X-Casa-Token", [])
            if len(tokens) != 1 or not hmac.compare_digest(tokens[0], self.server.app.csrf_token):
                raise AppError("Recarregue o painel para atualizar a sessão local.", 403, "invalid_token")
            instant = time.monotonic()
            with self.server.rate_lock:
                # At most the 16 accepted clients may allocate rate state; prune old entries.
                for peer in list(self.server.rates):
                    if not self.server.rates[peer] or instant - self.server.rates[peer][-1] > 60:
                        del self.server.rates[peer]
                history = self.server.rates[self.client_address[0]]
                while history and instant - history[0] > 60:
                    history.popleft()
                if len(history) >= 90:
                    raise AppError("Muitos comandos. Aguarde um momento.", 429, "rate_limited")
                history.append(instant)

    def published_build(self):
        """Script principal do painel publicado em dist/index.html.

        O painel compara com o que está rodando e recarrega quando há versão nova. Vem pela API
        porque o service worker não intercepta /api/ (a cópia offline nunca responde por ela).
        """
        index = self.server.dist_dir / "index.html"
        try:
            stamp = index.stat().st_mtime_ns
            cached = getattr(self.server, "_build_cache", None)
            if not cached or cached[0] != stamp:
                found = re.search(r'<script[^>]+type="module"[^>]+src="(/assets/[A-Za-z0-9._-]+\.js)"', index.read_text(encoding="utf-8"))
                self.server._build_cache = cached = (stamp, found.group(1) if found else None)
            return cached[1]
        except OSError:
            return None

    def drain_body(self):
        """Descarta o corpo não lido antes de responder um erro.

        No Windows, fechar um socket com dados recebidos e não lidos envia RST e o cliente perde
        a resposta (WinError 10053). Lê no máximo 64 KiB, com o timeout normal do socket.
        """
        if self.command != "POST" or getattr(self, "_body_read", False):
            return
        lengths = self.headers.get_all("Content-Length", []) if self.headers else []
        if len(lengths) != 1 or not re.fullmatch(r"[0-9]{1,8}", lengths[0]):
            return
        remaining = min(int(lengths[0]), 65536)
        try:
            while remaining > 0:
                chunk = self.rfile.read(min(remaining, 16384))
                if not chunk:
                    break
                remaining -= len(chunk)
        except OSError:
            pass

    def read_json(self):
        if self.headers.get("Transfer-Encoding") is not None:
            raise AppError("Formato de envio não permitido.")
        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1 or not re.fullmatch(r"[0-9]{1,8}", lengths[0]):
            raise AppError("Tamanho do corpo obrigatório.", 411, "length_required")
        length = int(lengths[0])
        if length > MAX_BODY:
            raise AppError("Comando excede o limite de tamanho.", 413, "body_too_large")
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            raise AppError("Envie JSON.", 415, "unsupported_media")
        raw = self.rfile.read(length)
        self._body_read = True
        if len(raw) != length:
            raise AppError("Corpo incompleto.")
        try:
            def unique(pairs):
                result = {}
                for key, value in pairs:
                    if key in result:
                        raise ValueError
                    result[key] = value
                return result
            body = json.loads(raw, object_pairs_hook=unique, parse_constant=lambda value: (_ for _ in ()).throw(ValueError()))
        except (ValueError, UnicodeError, RecursionError):
            raise AppError("JSON inválido.") from None
        if not isinstance(body, dict):
            raise AppError("Objeto JSON obrigatório.")
        return body

    def do_GET(self):
        self.dispatch(False)

    def do_HEAD(self):
        self.dispatch(False)

    def do_POST(self):
        self.dispatch(True)

    def dispatch(self, mutation):
        try:
            if urlsplit(self.path).path == "/owntracks":
                self.receive_owntracks()
                return
            self.guard(mutation)
            target = urlsplit(self.path)
            path = target.path
            # The page itself may carry ?tray=1 (tray popup); API routes never take a query string.
            page_query = path in {"/", "/index.html"} and target.query == "tray=1" and not mutation
            if target.scheme or target.netloc or target.fragment or (target.query and not page_query):
                raise AppError("Caminho inválido.", 404, "not_found")
            app = self.server.app
            if mutation:
                body = self.read_json()
                match = re.fullmatch(r"/api/devices/([a-z-]+)/commands", path)
                scene = re.fullmatch(r"/api/scenes/([a-z-]+)/run", path)
                learn = re.fullmatch(r"/api/devices/(tv-quarto|ar-quarto)/learn", path)
                remove_place = re.fullmatch(r"/api/location/places/([a-z0-9-]{1,24})/remove", path)
                remove_routine = re.fullmatch(r"/api/routines/([0-9a-f]{8})/remove", path)
                tv = re.fullmatch(r"/api/tvs/([0-9a-f]{12})/(pair|command|label)", path)
                replay = re.fullmatch(r"/api/cameras/(cam[0-9]{1,2})/replay", path)
                replay_close = re.fullmatch(r"/api/replays/([0-9a-f]{12})/close", path)
                location = self.server.location
                if replay:
                    result = self.server.replays.open(replay[1], body)
                elif replay_close and not body:
                    result = self.server.replays.close(replay_close[1])
                elif path == "/api/routines":
                    result = self.server.routines.save(body)
                elif remove_routine and not body:
                    result = self.server.routines.remove(remove_routine[1])
                elif path == "/api/routines/timer":
                    result = self.server.routines.set_timer(body)
                elif path == "/api/energy":
                    try:
                        result = self.server.energy.configure(body)
                    except ValueError as error:
                        raise AppError(str(error)) from None
                elif path == "/api/motion/notify":
                    result = self.server.motion.set_notify(body)
                elif path == "/api/motion/seen" and not body:
                    result = self.server.motion.mark_seen()
                elif path == "/api/tvs/scan" and not body:
                    self.server.tvs.refresh(force=True)
                    result = self.server.tvs.status()
                elif tv and tv[2] == "pair" and not body:
                    result = self.server.tvs.pair(tv[1])
                elif tv and tv[2] == "command":
                    result = {**self.server.tvs.command(tv[1], body), **self.server.tvs.status()}
                elif tv and tv[2] == "label" and set(body) == {"label"}:
                    result = self.server.tvs.rename(tv[1], body["label"])
                elif path == "/api/location/setup" and set(body) == {"name"}:
                    result = {"phone": location.setup(body["name"]), "location": location.status()}
                elif path == "/api/location/phone" and not body:
                    result = {"phone": location.phone_config()}
                elif path == "/api/location/places":
                    result = location.save_place(body)
                elif remove_place and not body:
                    result = location.remove_place(remove_place[1])
                elif match:
                    result = app.command(match[1], body)
                elif learn:
                    result = app.learn(learn[1], body)
                elif scene and not body:
                    result = app.scene(scene[1])
                elif path == "/api/discovery" and not body:
                    result = app.discovery()
                else:
                    raise AppError("Recurso não encontrado.", 404, "not_found")
                self.json_response(200, result)
            elif path in {"/api/bootstrap", "/api/state"}:
                self.json_response(200, app.snapshot(path.endswith("bootstrap")))
            elif path == "/api/status":
                self.json_response(200, {"version": VERSION, "mode": app.mode, "configuredCount": len(app.config), "build": self.published_build()})
            elif path == "/api/location":
                self.json_response(200, self.server.location.status())
            elif path == "/api/routines":
                self.json_response(200, self.server.routines.status())
            elif path == "/api/energy":
                self.json_response(200, self.server.energy.summary())
            elif path == "/api/motion":
                self.json_response(200, self.server.motion.status())
            elif motion_camera := re.fullmatch(r"/api/motion/(cam[0-9]{1,2})", path):
                self.json_response(200, self.server.motion.status(camera=motion_camera[1]))
            elif photo := re.fullmatch(r"/api/motion/(\d{9,11}-[0-9a-f]{6})\.jpg", path):
                self.binary_response(self.server.motion.photo(photo[1]), "image/jpeg")
            elif path == "/api/tvs":
                self.json_response(200, self.server.tvs.status())
            elif path == "/api/health":
                server = self.server
                self.json_response(200, health_report(app, server.cameras, server.motion, server.tvs, server.backups, server.started))
            elif path == "/api/cameras":
                self.json_response(200, self.server.cameras.snapshot())
            elif camera := re.fullmatch(r"/api/cameras/(cam[0-9]{1,2})/frame\.jpg", path):
                data, age = self.server.cameras.frame(camera[1])
                self.binary_response(data, "image/jpeg", {"X-Frame-Age": str(round(age))})
            elif (camera := re.fullmatch(r"/api/cameras/(cam[0-9]{1,2})/ws", path)) and self.command == "GET":
                self.relay_ws(camera[1])
            elif (replay := re.fullmatch(r"/api/replays/([0-9a-f]{12})/ws", path)) and self.command == "GET":
                self.relay_ws(None, self.server.replays.stream(replay[1]), seconds=REPLAY_WINDOW + 60)
            elif (camera := re.fullmatch(r"/api/cameras/(cam[0-9]{1,2})/live\.mjpeg", path)) and self.command == "GET":
                self.stream_live(camera[1])
            elif path.startswith("/api/"):
                raise AppError("Recurso não encontrado.", 404, "not_found")
            else:
                self.serve_static(path)
        except AppError as error:
            self.drain_body()
            self.json_response(error.status, {"error": str(error), "code": error.code})
        except (TimeoutError, socket.timeout):
            self.json_response(408, {"error": "Tempo de envio esgotado.", "code": "request_timeout"})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.json_response(500, {"error": "Não foi possível concluir a solicitação.", "code": "internal_error"})

    def receive_owntracks(self):
        """Posições do app OwnTracks (modo HTTP). Sem token do painel: autentica por HTTP Basic."""
        self.guard(phone=True)
        if self.command != "POST" or urlsplit(self.path).query:
            raise AppError("Use POST.", 405, "method_not_allowed")
        self.server.location.authorize(self.headers.get("Authorization"), self.client_address[0])
        lengths = self.headers.get_all("Content-Length", [])
        # O app manda corpo vazio quando um amigo é apagado: nada a guardar.
        body = {} if lengths == ["0"] else self.read_json()
        self.json_response(200, self.server.location.ingest(body))

    def relay_ws(self, camera_id, stream=None, seconds=LIVE_SECONDS):
        if self.headers.get("Upgrade", "").lower() != "websocket":
            raise AppError("Pedido de vídeo inválido.", 400, "invalid_request")
        release, upstream, handshake = self.server.cameras.open_ws(camera_id, self.headers.get("Sec-WebSocket-Key"), stream)
        client = self.connection
        try:
            client.sendall(handshake)
            client.settimeout(None)
            upstream.settimeout(None)
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                readable, _, _ = select.select([client, upstream], [], [], 1.0)
                for source in readable:
                    data = source.recv(65536)
                    if not data:
                        return
                    (upstream if source is client else client).sendall(data)
        except (OSError, ValueError):
            pass
        finally:
            release()
            self.close_connection = True

    def binary_response(self, data, media_type, extra=None):
        self.send_response(200)
        self.send_header("Content-Type", media_type)
        self.send_header("Content-Length", str(len(data)))
        for name, value in (extra or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def stream_live(self, camera_id):
        release, upstream = self.server.cameras.open_live(camera_id)
        try:
            self.send_response(200)
            self.send_header("Content-Type", upstream.getheader("Content-Type"))
            self.end_headers()
            self.wfile.flush()
            deadline = time.monotonic() + LIVE_SECONDS
            while time.monotonic() < deadline:
                chunk = upstream.read1(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)
        except (OSError, ValueError):
            # Viewer closed the stream or go2rtc stopped; the response has already started.
            pass
        finally:
            release()

    def serve_static(self, path):
        decoded = unquote(path)
        parts = Path(decoded.lstrip("/")).parts
        if "\\" in decoded or ":" in decoded or any(p.startswith(".") or p == ".." for p in parts) or "%" in decoded or "\x00" in decoded:
            raise AppError("Arquivo não encontrado.", 404, "not_found")
        if decoded in {"/", "/index.html"}:
            relative = Path("index.html")
        elif decoded.startswith("/assets/") and Path(decoded).suffix.lower() in {".js", ".css", ".woff", ".woff2", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".glb"}:
            relative = Path(decoded.lstrip("/"))
        elif decoded in {"/favicon.svg", "/icon.svg", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/sw.js"}:
            relative = Path(decoded.lstrip("/"))
        else:
            raise AppError("Arquivo não encontrado.", 404, "not_found")
        candidate = self.server.dist_dir / relative
        resolved = candidate.resolve()
        if not resolved.is_relative_to(self.server.dist_dir) or any(p.is_symlink() for p in [candidate, *candidate.parents] if p != self.server.dist_dir and p.is_relative_to(self.server.dist_dir)) or not resolved.is_file():
            raise AppError("Interface ainda não compilada ou arquivo indisponível.", 404, "not_found")
        data = resolved.read_bytes()
        media_type = mimetypes.guess_type(resolved.name)[0] or "application/octet-stream"
        if resolved.suffix == ".js":
            media_type = "text/javascript"
        self.send_response(200)
        self.send_header("Content-Type", media_type)
        self.send_header("Content-Length", str(len(data)))
        if decoded == "/sw.js":
            self.send_header("Service-Worker-Allowed", "/")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)


def main():
    parser = argparse.ArgumentParser(description="Casa Local: servidor privado, sem login de marcas.")
    parser.add_argument("--mode", choices=["preview", "local"], default="preview")
    parser.add_argument("--lan", action="store_true", help="Permitir LAN/Tailscale; vincular em 0.0.0.0.")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Porta inválida.")
    try:
        server = CasaServer(("0.0.0.0" if args.lan else "127.0.0.1", args.port), CasaApp(args.mode), allowed_hosts=os.environ.get("CASA_ALLOWED_HOSTS", "").split(","))
        print(f"Casa Local · {args.mode} · http://localhost:{args.port}")
        print("Acesso privado à LAN habilitado." if args.lan else "Acesso apenas neste computador. Use --lan para iPhone na mesma rede.")
        server.cameras.start()
        server.start_background()
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    except (AppError, OSError, ValueError):
        print("Não foi possível iniciar. Confira a porta, os hosts permitidos e a configuração segura.")
        raise SystemExit(1) from None
    finally:
        if "server" in locals():
            server.server_close()


if __name__ == "__main__":
    main()
