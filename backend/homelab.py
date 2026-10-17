"""Home lab no WSL (Debian "homelab" + Docker) e o modo jogo.

- Lab: a tarefa CasaLocal-homelab mantém a distro ligada (sem cliente o WSL a desliga) e os
  containers sobem com `docker compose up -d` em ~/homelab.
- Jogo: para os serviços pesados (mídia, downloads, Frigate) e esvazia o cache do Linux para o
  Windows retomar a memória. Os leves de aviso continuam (ntfy, Uptime Kuma, Vaultwarden...): o
  celular segue recebendo os avisos de câmera durante a partida. Pode entrar sozinho quando um jogo
  da lista abre (ex.: cs2.exe) e sair 2 min depois que fecha; o modo jogo ligado à mão só sai à mão.
- Frigate (câmeras inteligentes) pesa ~2 GB e meia CPU: por padrão só liga com você fora de casa
  (localização do celular, lugar chamado "Casa"); em casa ou sem localização, os avisos de movimento
  vêm do DVR. Dá para deixar sempre ou nunca.
- Monitor: CPU, memória, GPU (nvidia-smi), discos e memória da VM do WSL, com 24 h de histórico.

O status dos containers é lido só com a distro já ligada (`wsl -d` a ligaria se estivesse parada).
"""
from collections import deque
from copy import deepcopy
import csv
import ctypes
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time

from .models import AppError

DISTRO, TASK, STACK = "homelab", "CasaLocal-homelab", "/home/filippe/homelab"
GAMES = ("cs2.exe",)
AUTO_EXIT_SECONDS = 120
POLL_SECONDS = 15
NO_WINDOW = 0x08000000
# Serviços na aba Lab. link: ("http", porta) no endereço do painel; ("https", porta) ou ("path", caminho)
# pelo Tailscale Serve; ("tls", porta) https com certificado próprio do serviço; None sem página.
SERVICES = [
    {"id": "jellyfin", "name": "Jellyfin", "purpose": "Filmes e séries", "link": ("path", "/jellyfin")},
    {"id": "jellyseerr", "name": "Jellyseerr", "purpose": "Pedir filmes e séries", "link": ("http", 5055)},
    {"id": "frigate", "name": "Frigate", "purpose": "Pessoas, carros e rostos nas câmeras", "link": ("tls", 8971)},
    {"id": "opengym-web", "name": "openGym", "purpose": "Treinos e peso", "link": ("https", 8443)},
    {"id": "vaultwarden", "name": "Vaultwarden", "purpose": "Senhas (app Bitwarden)", "link": ("path", "/vault")},
    {"id": "ntfy", "name": "ntfy", "purpose": "Avisos no celular", "link": ("https", 10000)},
    {"id": "uptime-kuma", "name": "Uptime Kuma", "purpose": "Disponibilidade dos serviços", "link": ("http", 3001)},
    {"id": "qbittorrent", "name": "qBittorrent", "purpose": "Downloads", "link": ("http", 8080)},
    {"id": "radarr", "name": "Radarr", "purpose": "Filmes", "link": ("http", 7878)},
    {"id": "sonarr", "name": "Sonarr", "purpose": "Séries e animes", "link": ("http", 8989)},
    {"id": "prowlarr", "name": "Prowlarr", "purpose": "Indexadores", "link": ("http", 9696)},
    {"id": "bazarr", "name": "Bazarr", "purpose": "Legendas PT-BR", "link": ("http", 6767)},
    {"id": "filebrowser", "name": "Arquivos", "purpose": "Biblioteca pelo navegador", "link": ("http", 8081)},
    {"id": "dozzle", "name": "Dozzle", "purpose": "Logs dos serviços", "link": ("http", 8888)},
    {"id": "unpackerr", "name": "Unpackerr", "purpose": "Extrai downloads compactados", "link": None},
    {"id": "diun", "name": "Diun", "purpose": "Avisa atualizações", "link": None},
    {"id": "flaresolverr", "name": "FlareSolverr", "purpose": "Apoio aos indexadores", "link": None},
]
# Continuam no modo jogo: leves, e os avisos do celular dependem deles.
KEEP_IN_GAME = {"ntfy", "uptime-kuma", "diun", "dozzle", "vaultwarden", "opengym-api", "opengym-web"}
HISTORY_EVERY, HISTORY_POINTS = 300, 288  # um ponto a cada 5 min, 24 h
FRIGATE_MODES = {"fora", "sempre", "nunca"}
DROP_CACHE_EVERY = 600  # o WSL demora a devolver o cache de disco ao Windows (após um reinício, ~4 GB)
WSL = shutil.which("wsl.exe") or r"C:\Windows\System32\wsl.exe"
NVIDIA_SMI = shutil.which("nvidia-smi.exe") or r"C:\Windows\System32\nvidia-smi.exe"


def run(args, timeout=60):
    """Comando do Windows sem janela; devolve (código, saída). wsl.exe às vezes responde em UTF-16."""
    try:
        done = subprocess.run(args, capture_output=True, timeout=timeout, creationflags=NO_WINDOW if os.name == "nt" else 0)
    except (OSError, subprocess.TimeoutExpired) as error:
        return -1, str(error)
    raw = done.stdout + done.stderr
    text = raw.decode("utf-16-le", "ignore") if raw[1:2] == b"\x00" else raw.decode("utf-8", "ignore")
    return done.returncode, text.replace("\x00", "")


class _Times(ctypes.Structure):
    _fields_ = [("low", ctypes.c_ulong), ("high", ctypes.c_ulong)]


class Machine:
    """Uso de CPU (diferença entre leituras), memória, GPU e discos deste PC."""

    def __init__(self):
        self.last = None

    def cpu(self):
        try:
            idle, kernel, user = _Times(), _Times(), _Times()
            ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user))
        except (AttributeError, OSError):
            return None
        value = lambda t: (t.high << 32) | t.low
        now = (value(idle), value(kernel) + value(user))
        before, self.last = self.last, now
        if not before or now[1] == before[1]:
            return None
        return round(100 * (1 - (now[0] - before[0]) / (now[1] - before[1])))

    @staticmethod
    def gpu():
        code, out = run([NVIDIA_SMI, "--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw",
                         "--format=csv,noheader,nounits"], timeout=10)
        if code != 0 or not out.strip():
            return None
        name, temp, util, used, total, power = [p.strip() for p in out.strip().splitlines()[0].split(",")]
        number = lambda v: float(v) if re.fullmatch(r"[\d.]+", v) else None
        return {"name": name, "temp": number(temp), "use": number(util), "memUsed": number(used), "memTotal": number(total), "watts": number(power)}

    @staticmethod
    def disks():
        result = []
        for letter, label in (("C", "Windows"), ("E", "SSD dados"), ("D", "HD mídia")):
            try:
                usage = shutil.disk_usage(f"{letter}:\\")
            except OSError:
                continue
            result.append({"drive": letter, "label": label, "freeGb": round(usage.free / 2**30), "totalGb": round(usage.total / 2**30),
                           "used": round(100 * usage.used / usage.total)})
        return result

    @staticmethod
    def wsl_memory():
        code, out = run(["tasklist", "/fi", "imagename eq vmmemWSL", "/fo", "csv", "/nh"], timeout=10)
        rows = list(csv.reader(io.StringIO(out))) if code == 0 else []
        for row in rows:
            if len(row) >= 5 and row[0].lower().startswith("vmmem"):
                digits = re.sub(r"\D", "", row[4])
                return round(int(digits) / 1024 / 1024, 1) if digits else None
        return 0.0


class Homelab:
    def __init__(self, data_dir, enabled=True, clock=time.time, runner=run, machine=None, presence=lambda: None):
        self.enabled, self.clock, self.run, self.presence = enabled, clock, runner, presence
        self.path = Path(data_dir) / "homelab.json"
        self.lock = threading.Lock()
        self.busy = threading.Lock()  # uma troca de modo por vez
        self.machine = machine or Machine()
        try:
            saved = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            saved = {}
        self.auto = saved.get("auto", True) is True
        self.frigate_mode = saved.get("frigate", "fora") if saved.get("frigate") in FRIGATE_MODES else "fora"
        self.games = [g for g in saved.get("games", GAMES) if isinstance(g, str) and re.fullmatch(r"[\w .()-]{1,40}\.exe", g, re.I)] or list(GAMES)
        # O modo jogo não sobrevive a um reinício: ao subir, o home lab volta (a tarefa sobe no login).
        self.mode, self.reason, self.changed, self.step = "lab", None, clock(), None
        self.game_gone, self.games_open, self.host = None, [], None
        self.containers, self.running, self.stats, self.checked = {}, None, {}, 0
        self.history, self.history_at = deque(maxlen=HISTORY_POINTS), 0
        self.dropped_at = 0
        self.stop_event = threading.Event()
        self.thread = None

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"auto": self.auto, "games": self.games, "frigate": self.frigate_mode}), encoding="utf-8")
        temporary.replace(self.path)

    # ---- WSL ----
    def distro_running(self):
        code, out = self.run([WSL, "-l", "--running", "-q"], timeout=20)
        return code == 0 and DISTRO in [line.strip() for line in out.splitlines()]

    def compose(self, *args, timeout=180):
        return self.run([WSL, "-d", DISTRO, "-u", "filippe", "--cd", STACK, "--", "docker", "compose", *args], timeout=timeout)

    def read_containers(self):
        code, out = self.run([WSL, "-d", DISTRO, "-u", "filippe", "--", "docker", "ps", "-a", "--format", "{{json .}}"], timeout=30)
        if code != 0:
            return None
        found = {}
        for line in out.splitlines():
            try:
                item = json.loads(line)
            except ValueError:
                continue
            found[item.get("Names", "")] = {"state": item.get("State"), "status": item.get("Status")}
        return found

    # ---- modos ----
    def set_mode(self, body):
        if not self.enabled:
            raise AppError("O home lab só roda no PC de casa.", 409, "preview_mode")
        if not isinstance(body, dict) or not set(body) <= {"mode", "auto", "restart", "frigate"} or not body:
            raise AppError("Pedido inválido.")
        if "frigate" in body:
            if body["frigate"] not in FRIGATE_MODES:
                raise AppError("Escolha sempre, só fora de casa ou nunca.")
            with self.lock:
                self.frigate_mode = body["frigate"]
                self._save()
            threading.Thread(target=self.apply_frigate, daemon=True).start()
        if "restart" in body:
            if body["restart"] not in {s["id"] for s in SERVICES} | KEEP_IN_GAME:
                raise AppError("Serviço desconhecido.")
            if self.mode == "jogo" and body["restart"] not in KEEP_IN_GAME:
                raise AppError("No modo jogo esse serviço fica parado.", 409, "game_mode")
            threading.Thread(target=self.compose, args=("restart", body["restart"]), kwargs={"timeout": 120}, daemon=True).start()
        if "auto" in body:
            if type(body["auto"]) is not bool:
                raise AppError("Pedido inválido.")
            with self.lock:
                self.auto = body["auto"]
                self._save()
        if "mode" in body:
            if body["mode"] not in {"lab", "jogo"}:
                raise AppError("Modo inválido.")
            if self.busy.locked():
                raise AppError("Já estou trocando de modo; espere um instante.", 409, "busy")
            threading.Thread(target=self._switch, args=(body["mode"], "manual"), daemon=True).start()
            time.sleep(0.2)
        return self.status()

    def _switch(self, mode, reason):
        with self.busy:
            if mode == self.mode and self.step is None:
                with self.lock:
                    self.reason = reason
                return
            try:
                if mode == "jogo":
                    with self.lock:
                        self.step = "Parando o home lab…"
                    if self.distro_running():
                        code, out = self.compose("config", "--services", timeout=60)
                        heavy = sorted({line.strip() for line in out.splitlines() if line.strip()} - KEEP_IN_GAME) if code == 0 else []
                        if heavy:
                            self.compose("stop", *heavy, timeout=240)
                        # O Linux guarda a memória liberada como cache; esvaziar devolve ao Windows já.
                        self.run([WSL, "-d", DISTRO, "-u", "root", "--", "sh", "-c", "sync; echo 3 > /proc/sys/vm/drop_caches"], timeout=60)
                else:
                    with self.lock:
                        self.step = "Ligando o home lab…"
                    self.run(["schtasks", "/run", "/tn", TASK], timeout=20)
                    for _ in range(30):
                        if self.distro_running():
                            break
                        time.sleep(2)
                    self.compose("up", "-d", timeout=300)
                    if not self.frigate_wanted():
                        self.compose("stop", "frigate", timeout=120)
            finally:
                with self.lock:
                    self.mode, self.reason, self.changed, self.step = mode, reason, self.clock(), None
                    self.game_gone = None
                    self.checked = 0  # relê os containers já

    def frigate_wanted(self):
        if self.frigate_mode == "nunca":
            return False
        if self.frigate_mode == "sempre":
            return True
        return self.presence() is False  # só com a localização dizendo que você saiu

    def apply_frigate(self):
        """Liga ou desliga o Frigate conforme a escolha e a sua localização (nunca no modo jogo)."""
        if self.mode != "lab" or self.busy.locked() or not self.distro_running():
            return
        running = self.containers.get("frigate", {}).get("state") == "running"
        if self.frigate_wanted() and not running:
            self.compose("up", "-d", "frigate", timeout=180)
        elif not self.frigate_wanted() and running:
            self.compose("stop", "frigate", timeout=120)
            self.run([WSL, "-d", DISTRO, "-u", "root", "--", "sh", "-c", "sync; echo 3 > /proc/sys/vm/drop_caches"], timeout=60)

    def running_games(self):
        code, out = self.run(["tasklist", "/fo", "csv", "/nh"], timeout=15)
        if code != 0:
            return []
        names = {row[0].lower() for row in csv.reader(io.StringIO(out)) if row}
        return [g for g in self.games if g.lower() in names]

    def tick(self):
        """Uma volta do vigia: jogo automático, containers e números do PC."""
        games = self.running_games() if self.auto else []
        if games and self.mode == "lab" and not self.busy.locked():
            self._switch("jogo", f"auto:{games[0]}")
        elif self.mode == "jogo" and (self.reason or "").startswith("auto:") and not games and not self.busy.locked():
            self.game_gone = self.game_gone or self.clock()
            if self.clock() - self.game_gone >= AUTO_EXIT_SECONDS:
                self._switch("lab", "auto")
        elif games:
            self.game_gone = None
        running = self.distro_running()
        containers = self.read_containers() if running else {}
        stats = {"cpu": self.machine.cpu(), "gpu": self.machine.gpu(), "disks": self.machine.disks(), "wslGb": self.machine.wsl_memory()}
        try:
            from .health import machine
            stats.update(machine())
        except Exception:
            pass
        with self.lock:
            self.running, self.containers, self.stats, self.checked = running, containers or {}, stats, self.clock()
        self.apply_frigate()
        if running and self.clock() - self.dropped_at >= DROP_CACHE_EVERY:
            self.dropped_at = self.clock()
            self.run([WSL, "-d", DISTRO, "-u", "root", "--", "sh", "-c", "sync; echo 3 > /proc/sys/vm/drop_caches"], timeout=60)
        with self.lock:
            self.games_open = games
            if self.clock() - self.history_at >= HISTORY_EVERY:
                self.history_at = self.clock()
                gpu = stats.get("gpu") or {}
                self.history.append([int(self.clock()), stats.get("cpu"), (stats.get("memory") or {}).get("used"), gpu.get("temp"), stats.get("wslGb")])

    def status(self):
        with self.lock:
            services = []
            for service in SERVICES:
                state = self.containers.get(service["id"], {})
                kind, target = service["link"] or (None, None)
                services.append({"id": service["id"], "name": service["name"], "purpose": service["purpose"], "link": {"kind": kind, "target": target} if kind else None,
                                 "keep": service["id"] in KEEP_IN_GAME, "state": state.get("state") or ("stopped" if self.running is not None else "unknown"),
                                 "status": state.get("status")})
            return {"enabled": self.enabled, "mode": self.mode, "reason": self.reason, "since": int(self.changed), "step": self.step,
                    "auto": self.auto, "games": list(self.games), "frigate": self.frigate_mode, "frigateOn": self.frigate_wanted(), "presence": self.presence(), "gamesOpen": list(self.games_open), "host": self.host,
                    "wsl": self.running, "services": services, "stats": deepcopy(self.stats), "checked": int(self.checked),
                    "history": [list(point) for point in self.history]}

    def tailnet_host(self):
        """Nome do PC no Tailscale (links HTTPS do openGym e do Jellyfin funcionam de qualquer aparelho)."""
        tailscale = shutil.which("tailscale.exe") or r"C:\Program Files\Tailscale\tailscale.exe"
        code, out = self.run([tailscale, "status", "--json"], timeout=20)
        try:
            return json.loads(out)["Self"]["DNSName"].rstrip(".") if code == 0 else None
        except (ValueError, KeyError, TypeError):
            return None

    def start(self):
        if not self.enabled or self.thread is not None:
            return
        self.host = self.tailnet_host()

        def loop():
            self.machine.cpu()  # primeira leitura de referência
            # Ao subir (login), garante a stack ligada: containers parados à mão não voltam sozinhos.
            if not self.running_games():
                self.compose("up", "-d", timeout=300)
                if not self.frigate_wanted():
                    self.compose("stop", "frigate", timeout=120)
            while not self.stop_event.is_set():
                try:
                    self.tick()
                except Exception:
                    pass
                self.stop_event.wait(POLL_SECONDS)

        self.thread = threading.Thread(target=loop, daemon=True, name="casa-homelab")
        self.thread.start()

    def close(self):
        self.stop_event.set()
