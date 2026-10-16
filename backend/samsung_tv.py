"""TVs Samsung (Tizen) pela rede local: estado real e controle, sem nuvem.

- Descoberta: GET http://IP:8001/api/v2/ responde modelo, MAC e PowerState sem autenticação.
- Controle: WebSocket seguro em IP:8002. Na primeira conexão a TV mostra um pedido de permissão
  e, aceito, devolve um token que fica guardado com DPAPI. O pareamento só acontece quando o dono
  toca em "Parear" no painel.
- Ligar: TVs em Wi-Fi costumam desligar a rede no modo de espera; tenta Wake-on-LAN e a tecla de
  energia, mas pode não acordar (o IR da TV do quarto continua disponível).
"""
import base64
import ipaddress
import json
from pathlib import Path
import re
import secrets
import socket
import ssl
import struct
import threading
import time
import urllib.request

from .config import dpapi, private_ip
from .models import AppError

KEYS = {"power": "KEY_POWER", "volume_up": "KEY_VOLUP", "volume_down": "KEY_VOLDOWN", "mute": "KEY_MUTE",
        "up": "KEY_UP", "down": "KEY_DOWN", "left": "KEY_LEFT", "right": "KEY_RIGHT", "ok": "KEY_ENTER",
        "home": "KEY_HOME", "back": "KEY_RETURN", "source": "KEY_SOURCE", "play": "KEY_PLAY", "pause": "KEY_PAUSE"}
APPS = {"youtube": "111299001912", "netflix": "3201907018807", "prime": "3201910019365", "globoplay": "3201908019041"}
NAME = base64.b64encode("Casa Local".encode()).decode()
SCAN_EVERY = 300


def tv_id(mac):
    return re.sub(r"[^0-9a-f]", "", (mac or "").lower())[:12]


def info(ip, timeout=2):
    """Dados públicos da TV (sem autenticação). None se não for uma Samsung Tizen."""
    try:
        with urllib.request.urlopen(f"http://{ip}:8001/api/v2/", timeout=timeout) as response:
            data = json.loads(response.read(65536))
    except Exception:
        return None
    device = data.get("device") if isinstance(data, dict) else None
    if not isinstance(device, dict) or not device.get("wifiMac"):
        return None
    return {"ip": ip, "mac": device.get("wifiMac"), "model": device.get("modelName") or "Samsung",
            "power": "on" if device.get("PowerState", "on") == "on" else "standby",
            "size": (re.search(r"(\d{2})", device.get("modelName") or "") or [None, None])[1]}


def local_networks():
    networks = set()
    for entry in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
        address = entry[4][0]
        if private_ip(address) and not address.startswith(("127.", "100.")):
            networks.add(ipaddress.ip_network(f"{address}/24", strict=False))
    return networks


def scan():
    found, lock = [], threading.Lock()

    def check(ip):
        try:
            with socket.create_connection((ip, 8001), timeout=0.6):
                pass
        except OSError:
            return
        item = info(ip)
        if item:
            with lock:
                found.append(item)

    threads = [threading.Thread(target=check, args=(str(ip),), daemon=True) for net in local_networks() for ip in net.hosts()]
    for index in range(0, len(threads), 64):
        batch = threads[index:index + 64]
        [t.start() for t in batch]
        [t.join() for t in batch]
    return found


class TizenSocket:
    """WebSocket mínimo (RFC 6455) para o canal de controle remoto da TV, só texto."""

    def __init__(self, ip, token=None, timeout=8):
        query = f"name={NAME}" + (f"&token={token}" if token else "")
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE  # certificado autoassinado da própria TV, na rede local
        raw = socket.create_connection((ip, 8002), timeout=timeout)
        self.sock = context.wrap_socket(raw, server_hostname=ip)
        key = base64.b64encode(secrets.token_bytes(16)).decode()
        request = (f"GET /api/v2/channels/samsung.remote.control?{query} HTTP/1.1\r\nHost: {ip}:8002\r\n"
                   f"Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        self.sock.sendall(request.encode())
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = self.sock.recv(1024)
            if not chunk:
                raise OSError("handshake")
            head += chunk
        if b" 101 " not in head.split(b"\r\n", 1)[0]:
            raise OSError("handshake")
        self.buffer = head.split(b"\r\n\r\n", 1)[1]

    def _exact(self, size):
        while len(self.buffer) < size:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise OSError("closed")
            self.buffer += chunk
        data, self.buffer = self.buffer[:size], self.buffer[size:]
        return data

    def receive(self):
        while True:
            first, second = self._exact(2)
            opcode, length = first & 0x0F, second & 0x7F
            if length == 126:
                length = struct.unpack(">H", self._exact(2))[0]
            elif length == 127:
                length = struct.unpack(">Q", self._exact(8))[0]
            if length > 1 << 20:
                raise OSError("frame")
            payload = self._exact(length)
            if opcode == 0x9:
                self._send(0xA, payload)
            elif opcode == 0x8:
                raise OSError("closed")
            elif opcode == 0x1:
                return json.loads(payload.decode("utf-8"))

    def _send(self, opcode, payload):
        mask = secrets.token_bytes(4)
        header = bytes([0x80 | opcode])
        if len(payload) < 126:
            header += bytes([0x80 | len(payload)])
        elif len(payload) < 65536:
            header += bytes([0x80 | 126]) + struct.pack(">H", len(payload))
        else:
            header += bytes([0x80 | 127]) + struct.pack(">Q", len(payload))
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(header + mask + masked)

    def send(self, message):
        self._send(0x1, json.dumps(message).encode("utf-8"))

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


class SamsungTVs:
    def __init__(self, data_dir, scanner=scan, connector=TizenSocket, clock=time.time, preview=False):
        self.preview = preview
        self.path = Path(data_dir) / "tvs.dpapi"
        self.scanner, self.connector, self.clock = scanner, connector, clock
        self.lock = threading.Lock()
        self.pairing = set()
        self.last_scan = 0.0
        try:
            self.tvs = json.loads(dpapi(self.path.read_bytes(), decrypt=True)).get("tvs", {})
        except Exception:
            self.tvs = {}
        self.live = {}  # id -> estado atual lido da rede (power, ip)

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_bytes(dpapi(json.dumps({"tvs": self.tvs}).encode("utf-8")))
        temporary.replace(self.path)

    def _real_only(self):
        if self.preview:
            raise AppError("Prévia: nada é enviado às TVs.", 409, "preview_mode")

    def refresh(self, force=False):
        self._real_only()
        if not force and self.clock() - self.last_scan < SCAN_EVERY:
            return
        self.last_scan = self.clock()
        found = self.scanner()
        with self.lock:
            seen = set()
            for item in found:
                key = tv_id(item["mac"])
                if not key:
                    continue
                seen.add(key)
                stored = self.tvs.setdefault(key, {"label": f"TV {item['size']}\"" if item.get("size") else "TV Samsung", "token": None})
                stored.update(ip=item["ip"], model=item["model"], mac=item["mac"])
                self.live[key] = {"power": item["power"], "at": self.clock()}
            for key in self.tvs:
                if key not in seen:
                    self.live[key] = {"power": "off", "at": self.clock()}
            self._save()

    def poll_power(self):
        """Estado de cada TV conhecida, sem varrer a rede inteira."""
        for key, tv in list(self.tvs.items()):
            item = info(tv["ip"], timeout=1.5) if tv.get("ip") else None
            self.live[key] = {"power": item["power"] if item else "off", "at": self.clock()}

    def status(self):
        with self.lock:
            return {"tvs": [{"id": key, "label": tv.get("label"), "model": tv.get("model"), "paired": bool(tv.get("token")),
                             "pairing": key in self.pairing, "power": self.live.get(key, {}).get("power", "off")}
                            for key, tv in sorted(self.tvs.items(), key=lambda kv: kv[1].get("label") or "")],
                    "scannedAt": int(self.last_scan) or None}

    def _tv(self, key):
        tv = self.tvs.get(key)
        if not tv or not tv.get("ip"):
            raise AppError("TV não encontrada na rede.", 404, "not_found")
        return tv

    def pair(self, key):
        """Abre o canal sem token: a TV mostra "Permitir Casa Local?". Espera até 30 s pelo aceite."""
        self._real_only()
        tv = self._tv(key)
        if self.live.get(key, {}).get("power") != "on":
            raise AppError("Ligue a TV antes de parear.", 409, "tv_off")
        with self.lock:
            if key in self.pairing:
                raise AppError("Pareamento já em andamento: aceite na TV.", 409, "busy")
            self.pairing.add(key)
        try:
            channel = self.connector(tv["ip"], None, timeout=35)
            try:
                deadline = self.clock() + 32
                while self.clock() < deadline:
                    message = channel.receive()
                    event = message.get("event")
                    if event == "ms.channel.connect":
                        token = (message.get("data") or {}).get("token")
                        if not token:
                            raise AppError("A TV conectou sem entregar a permissão. Tente de novo.", 502, "tv_no_token")
                        with self.lock:
                            tv["token"] = str(token)
                            self._save()
                        return self.status()
                    if event == "ms.channel.unauthorized":
                        raise AppError("A TV recusou. Toque em Parear de novo e escolha Permitir.", 403, "tv_denied")
                raise AppError("Ninguém aceitou na TV a tempo.", 408, "tv_timeout")
            finally:
                channel.close()
        except OSError:
            raise AppError("Não consegui falar com a TV. Ela está ligada?", 502, "device_unavailable") from None
        finally:
            with self.lock:
                self.pairing.discard(key)

    def _send(self, key, messages):
        tv = self._tv(key)
        if not tv.get("token"):
            raise AppError("Pareie a TV primeiro.", 409, "tv_unpaired")
        try:
            channel = self.connector(tv["ip"], tv["token"], timeout=6)
        except OSError:
            raise AppError("A TV não respondeu pela rede.", 502, "device_unavailable") from None
        try:
            hello = channel.receive()
            if hello.get("event") == "ms.channel.unauthorized":
                with self.lock:
                    tv["token"] = None
                    self._save()
                raise AppError("A TV revogou a permissão. Pareie de novo.", 403, "tv_unpaired")
            if (hello.get("data") or {}).get("token") and hello["data"]["token"] != tv["token"]:
                with self.lock:
                    tv["token"] = str(hello["data"]["token"])
                    self._save()
            for message in messages:
                channel.send(message)
                time.sleep(0.15)
        except OSError:
            raise AppError("A conexão com a TV caiu.", 502, "device_unavailable") from None
        finally:
            channel.close()

    def command(self, key, body):
        self._real_only()
        if not isinstance(body, dict) or len(body) != 1:
            raise AppError("Comando inválido.")
        if "key" in body and body["key"] in KEYS:
            if body["key"] == "power" and self.live.get(key, {}).get("power") != "on":
                self.wake(key)
            self._send(key, [{"method": "ms.remote.control", "params": {"Cmd": "Click", "DataOfCmd": KEYS[body["key"]], "Option": "false", "TypeOfRemote": "SendRemoteKey"}}])
        elif "app" in body and body["app"] in APPS:
            self._send(key, [{"method": "ms.channel.emit", "params": {"event": "ed.apps.launch", "to": "host", "data": {"appId": APPS[body["app"]], "action_type": "DEEP_LINK"}}}])
        else:
            raise AppError("Tecla ou app não permitido.")
        return {"status": "sent", "message": "Enviado pela rede para a TV."}

    def wake(self, key):
        tv = self._tv(key)
        mac = bytes.fromhex(tv_id(tv.get("mac")))
        if len(mac) != 6:
            return
        packet = b"\xff" * 6 + mac * 16
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            for target in {str(ipaddress.ip_network(f"{tv['ip']}/24", strict=False).broadcast_address), "255.255.255.255"}:
                try:
                    sock.sendto(packet, (target, 9))
                except OSError:
                    pass

    def rename(self, key, label):
        if not isinstance(label, str) or not 1 <= len(label.strip()) <= 24:
            raise AppError("Nome de até 24 caracteres.")
        with self.lock:
            self._tv(key)["label"] = label.strip()
            self._save()
        return self.status()

    def start(self, stop_event):
        def loop():
            while not stop_event.is_set():
                try:
                    if self.clock() - self.last_scan >= SCAN_EVERY:
                        self.refresh(force=True)
                    else:
                        self.poll_power()
                except Exception:
                    pass
                stop_event.wait(30)

        threading.Thread(target=loop, daemon=True, name="casa-tvs").start()
