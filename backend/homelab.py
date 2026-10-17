"""Home lab no WSL (Debian "homelab" + Docker) e o modo jogo.

- Lab: a tarefa CasaLocal-homelab mantém a distro ligada (sem cliente o WSL a desliga) e os
  containers sobem com `docker compose up -d` em ~/homelab.
- Jogo: `docker compose stop`, fim da tarefa e `wsl --shutdown`: a RAM do WSL volta ao Windows.
  Pode entrar sozinho quando um jogo da lista abre (ex.: cs2.exe) e sair 2 min depois que fecha;
  o modo jogo ligado à mão só sai à mão.
- Monitor: CPU, memória, GPU (nvidia-smi), discos e memória da VM do WSL, para a aba Lab no celular.

O status dos containers é lido só com a distro já ligada (`wsl -d` a ligaria de novo no meio do jogo).
"""
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
# id do container, nome, para quê, porta http, porta https do Tailscale Serve (se houver)
SERVICES = [
    ("jellyfin", "Jellyfin", "Filmes e séries", 8096, 10000),
    ("jellyseerr", "Jellyseerr", "Pedir filmes e séries", 5055, None),
    ("opengym-web", "openGym", "Treinos e peso", 8090, 8443),
    ("qbittorrent", "qBittorrent", "Downloads", 8080, None),
    ("radarr", "Radarr", "Filmes", 7878, None),
    ("sonarr", "Sonarr", "Séries e animes", 8989, None),
    ("prowlarr", "Prowlarr", "Indexadores", 9696, None),
    ("bazarr", "Bazarr", "Legendas PT-BR", 6767, None),
    ("filebrowser", "Arquivos", "Biblioteca pelo navegador", 8081, None),
    ("flaresolverr", "FlareSolverr", "Apoio aos indexadores", None, None),
]
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
    def __init__(self, data_dir, enabled=True, clock=time.time, runner=run, machine=None):
        self.enabled, self.clock, self.run = enabled, clock, runner
        self.path = Path(data_dir) / "homelab.json"
        self.lock = threading.Lock()
        self.busy = threading.Lock()  # uma troca de modo por vez
        self.machine = machine or Machine()
        try:
            saved = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            saved = {}
        self.auto = saved.get("auto", True) is True
        self.games = [g for g in saved.get("games", GAMES) if isinstance(g, str) and re.fullmatch(r"[\w .()-]{1,40}\.exe", g, re.I)] or list(GAMES)
        # O modo jogo não sobrevive a um reinício: ao subir, o home lab volta (a tarefa sobe no login).
        self.mode, self.reason, self.changed, self.step = "lab", None, clock(), None
        self.game_gone, self.games_open, self.host = None, [], None
        self.containers, self.running, self.stats, self.checked = {}, None, {}, 0
        self.stop_event = threading.Event()
        self.thread = None

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"auto": self.auto, "games": self.games}), encoding="utf-8")
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
        if not isinstance(body, dict) or not set(body) <= {"mode", "auto"} or not body:
            raise AppError("Pedido inválido.")
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
                        self.compose("stop", timeout=240)
                    self.run(["schtasks", "/end", "/tn", TASK], timeout=20)
                    # --shutdown e não --terminate: só desligar a distro deixa a VM (e a RAM dela) de pé.
                    self.run([WSL, "--shutdown"], timeout=60)
                else:
                    with self.lock:
                        self.step = "Ligando o home lab…"
                    self.run(["schtasks", "/run", "/tn", TASK], timeout=20)
                    for _ in range(30):
                        if self.distro_running():
                            break
                        time.sleep(2)
                    self.compose("up", "-d", timeout=300)
            finally:
                with self.lock:
                    self.mode, self.reason, self.changed, self.step = mode, reason, self.clock(), None
                    self.game_gone = None
                    self.checked = 0  # relê os containers já

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
            self.games_open = games

    def status(self):
        with self.lock:
            services = []
            for container, name, purpose, port, https in SERVICES:
                state = self.containers.get(container, {})
                services.append({"id": container, "name": name, "purpose": purpose, "port": port, "https": https,
                                 "state": state.get("state") or ("stopped" if self.running is not None else "unknown"), "status": state.get("status")})
            return {"enabled": self.enabled, "mode": self.mode, "reason": self.reason, "since": int(self.changed), "step": self.step,
                    "auto": self.auto, "games": list(self.games), "gamesOpen": list(self.games_open), "host": self.host,
                    "wsl": self.running, "services": services, "stats": deepcopy(self.stats), "checked": int(self.checked)}

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
