"""Casa Local na bandeja do Windows: um ícone só ("Casa") que abre o painel completo acima do
relógio, com as mesmas abas do celular (Luzes, Clima, TV, Câmeras, Local, Central).

- Clique: abre/fecha o painel na última aba usada. Ctrl+Alt+H faz o mesmo de qualquer lugar.
- Botão direito: ações rápidas (modos, ar, luzes, câmeras ao vivo) sem abrir o painel.
- Bolinha do ícone: verde ok, laranja com aviso novo (movimento, localização, saúde), vermelha se
  o painel caiu. Avisos do Windows para movimento nas câmeras marcadas, saída/chegada dela e
  serviços que pararam.
- Cada computador tem sua regra de alerta (painel > Câmeras > Movimento > Onde avisar): câmeras
  monitoradas, só algumas ou nenhuma. Com jogo ou vídeo em tela cheia os alertas esperam, e saem
  num resumo depois. "Avisos neste computador" no menu pausa por um tempo.

Uso: pythonw casa_tray.py --url https://pc.tailnet.ts.net [--servicos C:\\caminho\\CasaLocal]
--servicos habilita "Reiniciar serviços" (apenas no PC que roda o painel e o go2rtc).
"""
import argparse
import ctypes
from ctypes import wintypes
import json
import os
import secrets
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
import winreg
from pathlib import Path

import pystray
from PIL import Image, ImageDraw

from casa_janela import Janela

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_NAME = "CasaLocalBandeja"
POLL_SECONDS = 20
HEALTH_EVERY = 60
TABS = ("luzes", "clima", "tv", "cameras", "local", "lab", "central")
DOT = {"ok": (58, 211, 122), "aviso": (255, 181, 71), "fora": (255, 97, 89), "?": (157, 157, 166)}
WHITE = (255, 255, 255)
HOME = Path.home() / "AppData" / "Local" / "CasaLocalBandeja"
PAUSE_FOREVER = 4102444800  # o servidor entende como "até reativar"
DEFAULT_RULE = {"mode": "watched", "cameras": [], "game": True, "pausedUntil": 0}
HOTKEY_ID, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, WM_HOTKEY = 1, 0x1, 0x2, 0x4000, 0x0312


# Casa do ícone do app, na grade 16x16 do design (design/icone/grade-16.txt); a porta fica vazada
# porque na bandeja o vermelho é só de alerta. Cada célula vale 4 px nos 64 px do ícone.
HOUSE_GRID = (
    "................",
    "................",
    "................",
    ".......##.......",
    "......####......",
    ".....######.....",
    "....########....",
    "...##########...",
    "..############..",
    "...##########...",
    "...####..####...",
    "...####..####...",
    "...####..####...",
    "...####..####...",
    "................",
    "................",
)
LCD_BG, LCD_FG = (21, 21, 19), (241, 234, 215)


def glyph_house():
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    pen = ImageDraw.Draw(image)
    pen.rounded_rectangle((0, 0, 63, 63), radius=12, fill=LCD_BG)
    for y, row in enumerate(HOUSE_GRID):
        for x, cell in enumerate(row):
            if cell == "#":
                pen.rectangle((x * 4, y * 4, x * 4 + 3, y * 4 + 3), fill=LCD_FG)
    return image


def with_status(base, state, count=0):
    image = base.copy()
    pen = ImageDraw.Draw(image)
    pen.ellipse((38, 38, 64, 64), fill=(22, 22, 24))
    pen.ellipse((41, 41, 61, 61), fill=DOT[state])
    if count:
        text = str(min(count, 9))
        pen.text((51 - pen.textlength(text) / 2, 43), text, fill=(22, 22, 24))
    return image


def device_identity():
    """Id aleatório deste computador (não identifica a máquina; só separa as regras de alerta)."""
    path = HOME / "aparelho.json"
    try:
        saved = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(saved.get("id"), str) and len(saved["id"]) == 16:
            return saved["id"]
    except (OSError, ValueError, AttributeError):
        pass
    device_id = secrets.token_hex(8)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"id": device_id}), encoding="utf-8")
    return device_id


def default_name(services):
    """Nome inicial (dá para trocar no painel): PC de casa, Notebook ou Computador + nome do Windows."""
    class Power(ctypes.Structure):
        _fields_ = [("ac", ctypes.c_byte), ("battery", ctypes.c_byte), ("percent", ctypes.c_byte), ("saver", ctypes.c_byte), ("life", wintypes.DWORD), ("full", wintypes.DWORD)]
    power = Power()
    laptop = ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(power)) and not power.battery & 128
    kind = "PC de casa" if services else "Notebook" if laptop else "Computador"
    return f"{kind} ({os.environ.get('COMPUTERNAME', '?').title()})"[:30]


def fullscreen_busy():
    """Jogo, vídeo ou apresentação em tela cheia agora (para segurar os alertas)."""
    state = ctypes.c_int(0)
    try:
        # 2 tela cheia ocupada, 3 jogo Direct3D exclusivo, 4 apresentação.
        if ctypes.windll.shell32.SHQueryUserNotificationState(ctypes.byref(state)) == 0 and state.value in (2, 3, 4):
            return True
    except OSError:
        pass
    # Jogos em "janela sem bordas" não aparecem acima: confere se a janela da frente cobre o monitor.
    user32 = ctypes.windll.user32
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return False
    name = ctypes.create_unicode_buffer(64)
    user32.GetClassNameW(hwnd, name, 64)
    if name.value in ("Progman", "WorkerW", "Shell_TrayWnd", "Windows.UI.Core.CoreWindow"):
        return False  # área de trabalho, barra de tarefas, menu Iniciar

    class MonitorInfo(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("monitor", wintypes.RECT), ("work", wintypes.RECT), ("flags", wintypes.DWORD)]
    rect, info = wintypes.RECT(), MonitorInfo()
    info.size = ctypes.sizeof(MonitorInfo)
    if not user32.GetWindowRect(hwnd, ctypes.byref(rect)) or not user32.GetMonitorInfoW(user32.MonitorFromWindow(hwnd, 2), ctypes.byref(info)):
        return False
    screen = info.monitor
    return rect.left <= screen.left and rect.top <= screen.top and rect.right >= screen.right and rect.bottom >= screen.bottom


def autostart_command():
    pythonw = Path(sys.executable).with_name("pythonw.exe")
    return subprocess.list2cmdline([str(pythonw), str(Path(__file__).resolve()), *sys.argv[1:]])


def autostart_enabled():
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
            return bool(winreg.QueryValueEx(key, RUN_NAME)[0])
    except OSError:
        return False


def set_autostart(enabled):
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
        if enabled:
            winreg.SetValueEx(key, RUN_NAME, 0, winreg.REG_SZ, autostart_command())
        else:
            try:
                winreg.DeleteValue(key, RUN_NAME)
            except FileNotFoundError:
                pass


def pin_icons():
    """Windows 11 esconde ícones novos na setinha ^; marca o da Casa como sempre visível."""
    path = r"Control Panel\NotifyIconSettings"
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path) as root:
            for index in range(winreg.QueryInfoKey(root)[0]):
                name = winreg.EnumKey(root, index)
                with winreg.OpenKey(root, name, 0, winreg.KEY_READ | winreg.KEY_SET_VALUE) as entry:
                    try:
                        exe = winreg.QueryValueEx(entry, "ExecutablePath")[0].lower()
                        tip = str(winreg.QueryValueEx(entry, "InitialTooltip")[0]) if "pythonw" in exe else ""
                    except OSError:
                        continue
                    if exe.endswith("pythonw.exe") and tip.startswith("Casa"):
                        winreg.SetValueEx(entry, "IsPromoted", 0, winreg.REG_DWORD, 1)
    except OSError:
        pass


class Tray:
    def __init__(self, url, services):
        self.url = url.rstrip("/")
        self.services = Path(services) if services else None
        self.hidden_at = 0.0
        self.tab = "luzes"
        self.stop = threading.Event()
        self.token = None
        self.cameras = []
        self.state = {"server": "?", "cameras": "?", "location": "Verificando…", "health": None, "alerts": 0}
        self.seen = {"location": None, "motion": None, "health": {}}
        self.last_health = 0.0
        # Popup e alerta são subprocessos que nascem no clique e saem ao esconder (o WebView2 não fica residente).
        self.popup = Janela("popup", self.url, self.remember_tab, self.show, self.popup_closed)
        self.alert = Janela("alerta", self.url, lambda tab: None, self.show, lambda proc: None)
        self.device_id, self.device_name = device_identity(), default_name(services)
        self.rule, self.busy, self.held = None, False, {}  # held: câmera -> movimentos segurados
        self.modes, self.modes_at = [], 0.0
        self.lab = None  # estado do home lab / modo jogo (GET /api/homelab)
        self.base = glyph_house()
        self.icon = pystray.Icon("casa", with_status(self.base, "?"), "Casa", menu=self.menu())

    # ---- servidor ----
    def fetch(self, path, timeout=5):
        request = urllib.request.Request(self.url + path, headers={"Cache-Control": "no-store"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read(1 << 20))

    def post(self, path, body):
        """Ação pelo menu: usa o token do painel; renova uma vez se o servidor reiniciou."""
        for attempt in range(2):
            if not self.token:
                self.token = self.fetch("/api/bootstrap").get("csrfToken")
            request = urllib.request.Request(self.url + path, data=json.dumps(body).encode(), method="POST",
                                             headers={"Content-Type": "application/json", "X-Casa-Token": self.token or ""})
            try:
                with urllib.request.urlopen(request, timeout=25) as response:
                    return json.loads(response.read(1 << 20))
            except urllib.error.HTTPError as error:
                detail = json.loads(error.read(65536) or b"{}")
                if error.code == 403 and detail.get("code") == "invalid_token" and attempt == 0:
                    self.token = None
                    continue
                raise RuntimeError(detail.get("error") or "Não foi possível concluir.") from None
        raise RuntimeError("Não foi possível concluir.")

    def act(self, label, path, body):
        def run():
            try:
                result = self.post(path, body)
                message = (result.get("command") or {}).get("message") or ("Cena com falhas" if result.get("status") == "partial" else "Feito")
                self.icon.notify(message, f"Casa · {label}")
            except (OSError, ValueError, RuntimeError) as error:
                self.icon.notify(str(error) or "Central indisponível", f"Casa · {label}")
        threading.Thread(target=run, daemon=True).start()

    # ---- menu ----
    def menu(self):
        def device(label, device_id, values):
            return lambda: self.act(label, f"/api/devices/{device_id}/commands", {"action": "set", "values": values})

        def timer(minutes):
            return lambda: self.act("Ar", "/api/routines/timer", {"device": "ar-quarto", "minutes": minutes})

        def scene(label, scene_id):
            return lambda: self.act(label, f"/api/scenes/{scene_id}/run", {})

        def pause(seconds):
            return lambda: self.set_rule({"pausedUntil": 0 if seconds == 0 else PAUSE_FOREVER if seconds is None else int(time.time() + seconds)})

        def until_morning():
            moment = time.localtime(time.time() + 86400)
            return int(time.mktime((moment.tm_year, moment.tm_mon, moment.tm_mday, 8, 0, 0, 0, 0, -1))) - int(time.time())

        def camera(camera_id):
            return lambda: self.show(f"cameras:{camera_id}")

        cameras = [pystray.MenuItem(item["name"], camera(item["id"])) for item in self.cameras]
        items = [
            pystray.MenuItem("Abrir a Casa", lambda: self.toggle(), default=True),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Modos", pystray.Menu(*[pystray.MenuItem(m["name"], scene(m["name"], m["id"])) for m in self.modes])
                             if self.modes else pystray.Menu(pystray.MenuItem("Carregando…", None, enabled=False))),
            pystray.MenuItem("Ar-condicionado", pystray.Menu(
                pystray.MenuItem("Ligar · 24 °C resfriar", device("Ar", "ar-quarto", {"power": True, "temperature": 24, "mode": "cool", "fan": "auto"})),
                pystray.MenuItem("Desligar", device("Ar", "ar-quarto", {"power": False})),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Desligar em 1 h", timer(60)),
                pystray.MenuItem("Desligar em 2 h", timer(120)),
                pystray.MenuItem("Cancelar timer", timer(0)),
            )),
            pystray.MenuItem("Luzes", pystray.Menu(
                pystray.MenuItem("Acender quarto", device("Luz do quarto", "quarto-luz", {"power": True})),
                pystray.MenuItem("Apagar quarto", device("Luz do quarto", "quarto-luz", {"power": False})),
                pystray.MenuItem("Acender banheiro", device("Luz do banheiro", "banheiro-luz", {"power": True})),
                pystray.MenuItem("Apagar banheiro", device("Luz do banheiro", "banheiro-luz", {"power": False})),
            )),
            pystray.MenuItem("Câmeras ao vivo", pystray.Menu(*cameras) if cameras else pystray.Menu(pystray.MenuItem("Carregando…", None, enabled=False))),
            pystray.MenuItem("Modo jogo (para o home lab)", self.toggle_game, checked=lambda _: bool(self.lab) and self.lab.get("mode") == "jogo",
                             enabled=lambda _: bool(self.lab) and self.lab.get("enabled") and not self.lab.get("step")),
            pystray.MenuItem("Home lab", lambda: self.show("lab")),
            pystray.MenuItem("Localização", lambda: self.show("local")),
            pystray.MenuItem("Central (saúde e rotinas)", lambda: self.show("central")),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(lambda _: self.label(), None, enabled=False),
            pystray.MenuItem(lambda _: self.state["location"], None, enabled=False),
        ]
        if self.services:
            items.append(pystray.MenuItem("Reiniciar serviços", lambda: threading.Thread(target=self.restart, daemon=True).start()))
        items += [
            pystray.MenuItem("Avisos neste computador", pystray.Menu(
                pystray.MenuItem(lambda _: self.rule_label(), None, enabled=False),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Pausar por 1 hora", pause(3600)),
                pystray.MenuItem("Pausar até amanhã 8h", lambda: pause(until_morning())()),
                pystray.MenuItem("Pausar até eu reativar", pause(None)),
                pystray.MenuItem("Reativar", pause(0), enabled=lambda _: self.paused()),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Segurar com jogo em tela cheia", lambda: self.set_rule({"game": not self.current_rule()["game"]}), checked=lambda _: self.current_rule()["game"]),
                pystray.MenuItem("Escolher câmeras no painel", lambda: self.show("cameras:avisos")),
            )),
            pystray.MenuItem("Testar aviso", self.test_alert),
            pystray.MenuItem("Abrir no navegador", lambda: webbrowser.open(f"{self.url}/#{self.tab}")),
            pystray.MenuItem("Iniciar com o Windows", lambda: set_autostart(not autostart_enabled()), checked=lambda _: autostart_enabled()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Sair da Casa", self.quit),
        ]
        return pystray.Menu(*items)

    def test_alert(self):
        """Notificação do Windows e janela de alerta com o movimento mais recente (ou um exemplo)."""
        self.icon.notify("Se você está lendo isto, os avisos do Windows funcionam.", "Casa · Teste de aviso")
        try:
            events = self.fetch("/api/motion").get("events", [])
        except (OSError, ValueError):
            events = []
        # Sem histórico (instalação nova, ou o servidor não respondeu): um exemplo, sem foto.
        sample = events[0] if events else {"camera": (self.cameras[0]["id"] if self.cameras else "cam1"), "id": "", "start": time.time() - 120}
        self.hide()
        while self.popup.alive():  # o alerta não abre com o painel aberto
            time.sleep(0.1)
        self.show_alert(sample)

    # ---- regra de alerta deste computador ----
    def current_rule(self):
        return self.rule or DEFAULT_RULE

    def paused(self):
        return self.current_rule()["pausedUntil"] > time.time()

    def rule_label(self):
        rule = self.current_rule()
        if self.paused():
            until = rule["pausedUntil"]
            return "Pausado até reativar" if until >= PAUSE_FOREVER else f"Pausado até {time.strftime('%d/%m %H:%M' if until - time.time() > 20 * 3600 else '%H:%M', time.localtime(until))}"
        if rule["mode"] == "none":
            return "Desligado neste computador"
        if rule["game"] and self.busy:
            return "Segurando: tela cheia"
        return "Avisando: câmeras monitoradas" if rule["mode"] == "watched" else f"Avisando: {len(rule['cameras'])} câmera(s) escolhida(s)"

    def hello(self):
        """Apresenta-se ao servidor (conta se está em tela cheia) e recebe a regra deste computador."""
        self.busy = fullscreen_busy()
        try:
            rule = self.post("/api/alert-devices/hello", {"id": self.device_id, "name": self.device_name, "busy": self.busy})
            self.rule = {key: rule[key] for key in DEFAULT_RULE}
        except (OSError, ValueError, RuntimeError, KeyError, TypeError):
            pass  # servidor antigo ou fora: mantém a última regra conhecida

    def set_rule(self, changes):
        def run():
            try:
                self.post(f"/api/alert-devices/{self.device_id}", changes)
                self.hello()
                self.icon.update_menu()
                self.icon.notify(self.rule_label(), "Casa · Avisos neste computador")
            except (OSError, ValueError, RuntimeError) as error:
                self.icon.notify(str(error) or "Central indisponível", "Casa · Avisos")
        threading.Thread(target=run, daemon=True).start()

    def toggle_game(self):
        mode = "lab" if self.lab and self.lab.get("mode") == "jogo" else "jogo"
        def run():
            try:
                self.lab = self.post("/api/homelab", {"mode": mode})
                self.icon.update_menu()
                self.icon.notify("Parando o home lab para jogar…" if mode == "jogo" else "Ligando o home lab de novo…", "Casa · Modo jogo")
            except (OSError, ValueError, RuntimeError) as error:
                self.icon.notify(str(error) or "Central indisponível", "Casa · Modo jogo")
        threading.Thread(target=run, daemon=True).start()

    def label(self):
        if self.state["server"] == "fora":
            return "Central indisponível"
        if self.state["server"] != "ok":
            return "Verificando…"
        parts = ["Central funcionando", "câmeras ok" if self.state["cameras"] == "ok" else "câmeras paradas"]
        if self.state["health"] and self.state["health"] != "ok":
            parts.append("ver Central")
        return " · ".join(parts)

    # ---- painel ----
    def toggle(self):
        if self.popup.alive() or time.monotonic() - self.hidden_at < 0.6:
            self.hide()
        else:
            self.show()

    def show(self, target=None):
        """Abre o popup (ou leva o que está aberto ao alvo). O alerta aberto dá lugar a ele."""
        self.alert.stop()
        if target and target.split(":")[0] in TABS:
            self.tab = target.split(":")[0]
        target = target if target and target.split(":")[0] in TABS else self.tab
        if not self.popup.send(target):
            self.popup.start(target)

    def hide(self):
        self.popup.stop()

    def remember_tab(self, tab):
        self.tab = tab if tab in TABS else self.tab

    def popup_closed(self, proc):
        self.hidden_at = time.monotonic()

    def restart(self):
        script = self.services / "scripts" / "reiniciar-inicio.ps1"
        self.icon.notify("Reiniciando painel e câmeras…", "Casa Local")
        subprocess.run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)], creationflags=subprocess.CREATE_NO_WINDOW, timeout=90, check=False)
        self.poll_once()
        self.icon.notify(self.label(), "Casa Local")

    # ---- avisos ----
    def poll_location(self):
        try:
            status = self.fetch("/api/location")
        except (OSError, ValueError):
            return "Localização indisponível", 0
        if not status.get("configured"):
            return "Localização não configurada", 0
        names = {p["id"]: p["name"] for p in status.get("places", [])}
        parts = []
        for person in status.get("people", []):
            last = person.get("last")
            if not last:
                parts.append(f"{person['name']}: aguardando")
                continue
            where = f"em {names[person['place']]}" if person.get("place") in names else "a caminho" if (last.get("vel") or 0) >= 3 else "fora"
            age = max(0, status["now"] - last["tst"])
            parts.append(f"{person['name']} {where} · " + ("agora" if age < 60 else f"{round(age / 60)} min" if age < 3600 else f"{age // 3600} h"))
        text = " | ".join(parts) or "Ninguém cadastrado na localização"
        events = status.get("events", [])
        newest = max((e["tst"] for e in events), default=0)
        fresh = 0
        if self.seen["location"] is not None:
            for event in events:
                if event["tst"] > self.seen["location"]:
                    fresh += 1
                    verb = "saiu de" if event["kind"] == "saiu" else "chegou em"
                    when = time.strftime("%H:%M", time.localtime(event["tst"]))
                    self.icon.notify(f"{event.get('name', 'Alguém')} {verb} {names.get(event['place'], 'um lugar')} às {when}", "Casa · Localização")
        self.seen["location"] = max(newest, self.seen["location"] or 0)
        return text, fresh

    def poll_motion(self):
        try:
            motion = self.fetch("/api/motion")
        except (OSError, ValueError):
            return 0
        names = {c["id"]: c["name"] for c in self.cameras}
        rule = self.current_rule()
        chosen = motion.get("notify", []) if rule["mode"] == "watched" else rule["cameras"] if rule["mode"] == "some" else []
        watched = [e for e in motion.get("events", []) if e["camera"] in chosen]
        newest = max((e["start"] for e in watched), default=0)
        paused, gaming = self.paused(), rule["game"] and self.busy
        quiet = paused or gaming
        if self.seen["motion"] is not None:
            fresh = [e for e in watched if e["start"] > self.seen["motion"]]
            if paused:
                self.held = {}  # pausa pedida: nada de alerta nem resumo depois (o histórico fica no painel)
            elif fresh and gaming:
                # Jogando: não interrompe; guarda para um resumo quando sair da tela cheia.
                for event in fresh:
                    self.held[event["camera"]] = self.held.get(event["camera"], 0) + 1
            elif fresh:
                cams = sorted({names.get(e["camera"], e["camera"]) for e in fresh})
                self.icon.notify(f"Movimento em {', '.join(cams)}", "Casa · Câmeras")
                self.show_alert(max(fresh, key=lambda e: e["start"]))
        if self.held and not quiet:
            total = sum(self.held.values())
            cams = sorted(names.get(c, c) for c in self.held)
            self.icon.notify(f"{total} {'movimento' if total == 1 else 'movimentos'} enquanto os avisos esperavam: {', '.join(cams)}", "Casa · Câmeras")
            self.held = {}
        self.seen["motion"] = max(newest, self.seen["motion"] or 0)
        return motion.get("unseen", 0)

    # ---- alerta com foto ----
    def show_alert(self, event):
        """Janela de alerta acima do relógio com a foto do movimento; some sozinha em 25 s."""
        if self.popup.alive():
            return  # painel aberto: a pessoa já está olhando
        target = "alerta:%s:%s:%d" % (event["camera"], event["id"], int(event["start"]))
        if not self.alert.send(target):
            self.alert.start(target)

    def poll_health(self):
        if time.monotonic() - self.last_health < HEALTH_EVERY:
            return
        self.last_health = time.monotonic()
        try:
            health = self.fetch("/api/health", timeout=10)
        except (OSError, ValueError):
            return
        self.state["health"] = health.get("state")
        for check in health.get("checks", []):
            before = self.seen["health"].get(check["id"])
            if before and before != "fail" and check["state"] == "fail":
                self.icon.notify(f"{check['label']}: {check['detail']}", "Casa · Saúde")
            self.seen["health"][check["id"]] = check["state"]

    def poll_once(self):
        try:
            self.fetch("/api/status")
            server = "ok"
            try:
                cameras = self.fetch("/api/cameras")
                camera_state = "ok" if cameras.get("available") else "aviso"
                if not self.cameras and cameras.get("cameras"):
                    self.cameras = cameras["cameras"]
                    self.icon.menu = self.menu()
            except (OSError, ValueError):
                camera_state = "aviso"
        except (OSError, ValueError):
            server, camera_state = "fora", "fora"
        location, alerts = ("Central indisponível", 0) if server != "ok" else self.poll_location()
        if server == "ok":
            self.hello()
            if not self.modes or time.monotonic() - self.modes_at > HEALTH_EVERY:
                try:
                    modes = [{"id": m["id"], "name": m["name"]} for m in self.fetch("/api/state").get("scenes", [])]
                    self.modes_at = time.monotonic()
                    if modes != self.modes:
                        self.modes = modes
                        self.icon.menu = self.menu()
                except (OSError, ValueError, KeyError, TypeError):
                    pass
            alerts += self.poll_motion()
            try:
                self.lab = self.fetch("/api/homelab")
            except (OSError, ValueError):
                pass
            self.poll_health()
        self.state.update(server=server, cameras=camera_state, location=location, alerts=alerts)
        dot = "fora" if server == "fora" else "aviso" if alerts or camera_state != "ok" or self.state["health"] in ("warn", "fail") else "ok" if server == "ok" else "?"
        self.icon.icon = with_status(self.base, dot, alerts)
        self.icon.title = f"Casa · {self.label()}"[:120]
        self.icon.update_menu()

    def poll(self):
        while not self.stop.is_set():
            try:
                self.poll_once()
            except Exception:
                pass
            self.stop.wait(POLL_SECONDS)

    # ---- atalho global ----
    def hotkey(self):
        """Ctrl+Alt+H abre/fecha o painel (registrado nesta thread, que recebe a mensagem)."""
        user32 = ctypes.windll.user32
        if not user32.RegisterHotKey(None, HOTKEY_ID, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, ord("H")):
            return  # outro programa já usa o atalho
        message = wintypes.MSG()
        while not self.stop.is_set() and user32.GetMessageW(ctypes.byref(message), None, 0, 0) > 0:
            if message.message == WM_HOTKEY and message.wParam == HOTKEY_ID:
                self.toggle()
        user32.UnregisterHotKey(None, HOTKEY_ID)

    def quit(self):
        self.stop.set()
        self.icon.stop()
        self.popup.stop()
        self.alert.stop()

    def run(self):
        self.icon.run_detached()
        threading.Thread(target=self.poll, daemon=True).start()
        threading.Thread(target=self.hotkey, daemon=True).start()
        # O Windows registra o ícone em NotifyIconSettings com atraso; tenta fixá-lo nos primeiros minutos.
        for _ in range(12):
            pin_icons()
            if self.stop.wait(15):
                break
        self.stop.wait()


def main():
    parser = argparse.ArgumentParser(description="Casa Local na bandeja do Windows.")
    parser.add_argument("--url", required=True, help="Endereço do painel, ex.: http://127.0.0.1:8787")
    parser.add_argument("--servicos", help="Pasta do Casa Local neste PC, para reiniciar os serviços.")
    args = parser.parse_args()
    mutex = ctypes.windll.kernel32.CreateMutexW(None, False, "Local\\CasaLocalBandeja")
    if ctypes.windll.kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS: uma instância por usuário
        return
    Tray(args.url, args.servicos).run()
    ctypes.windll.kernel32.CloseHandle(mutex)


if __name__ == "__main__":
    main()
