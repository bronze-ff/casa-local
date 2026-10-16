"""Casa Local na bandeja do Windows: um ícone só ("Casa") que abre o painel completo acima do
relógio, com as mesmas abas do celular (Luzes, Clima, TV, Câmeras, Local, Central).

- Clique: abre/fecha o painel na última aba usada. Ctrl+Alt+H faz o mesmo de qualquer lugar.
- Botão direito: ações rápidas (cenas, ar, luzes, câmeras ao vivo) sem abrir o painel.
- Bolinha do ícone: verde ok, laranja com aviso novo (movimento, localização, saúde), vermelha se
  o painel caiu. Avisos do Windows para movimento nas câmeras marcadas, saída/chegada dela e
  serviços que pararam.

Uso: pythonw casa_tray.py --url https://pc.tailnet.ts.net [--servicos C:\\caminho\\CasaLocal]
--servicos habilita "Reiniciar serviços" (apenas no PC que roda o painel e o go2rtc).
"""
import argparse
import ctypes
from ctypes import wintypes
import json
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
import webview
import webview.errors
from PIL import Image, ImageDraw

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_NAME = "CasaLocalBandeja"
MARGIN = 12
SIZE = (440, 760)
ALERT_SIZE, ALERT_SECONDS = (390, 176), 25  # alerta de movimento acima do relógio; some sozinho
POLL_SECONDS = 20
HEALTH_EVERY = 60
TABS = ("luzes", "clima", "tv", "cameras", "local", "central")
DOT = {"ok": (58, 211, 122), "aviso": (255, 181, 71), "fora": (255, 97, 89), "?": (157, 157, 166)}
WHITE = (255, 255, 255)
HOTKEY_ID, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, WM_HOTKEY = 1, 0x1, 0x2, 0x4000, 0x0312


def glyph_house():
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    pen = ImageDraw.Draw(image)
    pen.rounded_rectangle((2, 2, 62, 62), radius=16, fill=(47, 107, 255))
    pen.polygon([(32, 11), (54, 30), (49, 30), (49, 52), (15, 52), (15, 30), (10, 30)], fill=WHITE)
    pen.rounded_rectangle((27, 36, 37, 52), radius=2, fill=(47, 107, 255))
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


def work_area():
    rect = wintypes.RECT()
    ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0)  # SPI_GETWORKAREA
    return rect.left, rect.top, rect.right, rect.bottom


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


class Api:
    """Exposto ao painel: o popup se esconde ao perder o foco, como os painéis do Windows."""

    def __init__(self, tray):
        self._tray = tray

    def hide(self):
        self._tray.hide()


class AlertApi:
    """Exposto à janela de alerta: dispensar ou abrir o painel no ponto certo (gravação/ao vivo)."""

    def __init__(self, tray):
        self._tray = tray

    def dismiss(self):
        self._tray.hide_alert()

    def open(self, target):
        if isinstance(target, str) and len(target) < 80:
            self._tray.hide_alert()
            self._tray.show(target)


class Tray:
    def __init__(self, url, services):
        self.url = url.rstrip("/")
        self.services = Path(services) if services else None
        self.visible = False
        self.hidden_at = 0.0
        self.tab = "luzes"
        self.stop = threading.Event()
        self.window = None
        self.token = None
        self.cameras = []
        self.state = {"server": "?", "cameras": "?", "location": "Verificando…", "health": None, "alerts": 0}
        self.seen = {"location": None, "motion": None, "health": {}}
        self.last_health = 0.0
        self.alert, self.alert_ready, self.alert_hwnd, self.alert_generation = None, False, None, 0
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

        def camera(camera_id):
            return lambda: self.show(f"cameras:{camera_id}")

        cameras = [pystray.MenuItem(item["name"], camera(item["id"])) for item in self.cameras]
        items = [
            pystray.MenuItem("Abrir a Casa", lambda: self.toggle(), default=True),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Cenas", pystray.Menu(
                pystray.MenuItem("Cinema", scene("Cinema", "cinema")),
                pystray.MenuItem("Boa noite", scene("Boa noite", "boa-noite")),
                pystray.MenuItem("Cheguei", scene("Cheguei", "cheguei")),
            )),
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
            pystray.MenuItem("Localização", lambda: self.show("local")),
            pystray.MenuItem("Central (saúde e rotinas)", lambda: self.show("central")),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(lambda _: self.label(), None, enabled=False),
            pystray.MenuItem(lambda _: self.state["location"], None, enabled=False),
        ]
        if self.services:
            items.append(pystray.MenuItem("Reiniciar serviços", lambda: threading.Thread(target=self.restart, daemon=True).start()))
        items += [
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
        if events:
            self.hide()
            self.show_alert(events[0])

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
        if self.visible or time.monotonic() - self.hidden_at < 0.6:
            self.hide()
        else:
            self.show()

    def show(self, target=None):
        try:
            self._show(target)
        except webview.errors.WebViewException:
            pass  # janela ainda iniciando; o próximo clique abre normalmente

    def _show(self, target):
        if not self.window:
            return
        width, height = SIZE
        scale = ctypes.windll.user32.GetDpiForSystem() / 96  # pywebview usa pixels lógicos
        _, _, right, bottom = work_area()
        height = min(height, round(bottom / scale) - 2 * MARGIN)
        self.window.resize(width, height)
        self.window.move(round(right / scale) - width - MARGIN, round(bottom / scale) - height - MARGIN)
        if target:
            self.tab = target.split(":")[0]
        self.window.evaluate_js(f"location.hash = {json.dumps(target or self.tab)}")
        self.shown_at = time.monotonic()
        self.had_focus = False
        self.visible = True
        self.window.show()
        self.window.restore()
        if self.hwnd:
            ctypes.windll.user32.SetForegroundWindow(self.hwnd)

    def hide(self):
        if self.window and self.visible:
            self.window.hide()
            self.visible = False
            self.hidden_at = time.monotonic()
            try:
                tab = str(self.window.evaluate_js("location.hash.slice(1)") or "").split(":")[0]
                self.tab = tab if tab in TABS else self.tab
                # Página "dorme": câmeras, vídeo ao vivo e cena 3D são desmontados enquanto o popup está fechado.
                self.window.evaluate_js("location.hash = 'oculto'")
            except webview.errors.WebViewException:
                pass

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
        last = status.get("last")
        if not last:
            text = f"{status['name']}: aguardando o primeiro envio"
        else:
            where = f"em {names[status['place']]}" if status.get("place") in names else "a caminho" if (last.get("vel") or 0) >= 3 else "fora dos lugares"
            age = max(0, status["now"] - last["tst"])
            text = f"{status['name']} {where} · " + ("agora" if age < 60 else f"há {round(age / 60)} min" if age < 3600 else f"há {age // 3600} h")
        events = status.get("events", [])
        newest = max((e["tst"] for e in events), default=0)
        fresh = 0
        if self.seen["location"] is not None:
            for event in events:
                if event["tst"] > self.seen["location"]:
                    fresh += 1
                    verb = "saiu de" if event["kind"] == "saiu" else "chegou em"
                    when = time.strftime("%H:%M", time.localtime(event["tst"]))
                    self.icon.notify(f"{status['name']} {verb} {names.get(event['place'], 'um lugar')} às {when}", "Casa · Localização")
        self.seen["location"] = max(newest, self.seen["location"] or 0)
        return text, fresh

    def poll_motion(self):
        try:
            motion = self.fetch("/api/motion")
        except (OSError, ValueError):
            return 0
        names = {c["id"]: c["name"] for c in self.cameras}
        watched = [e for e in motion.get("events", []) if e["camera"] in motion.get("notify", [])]
        newest = max((e["start"] for e in watched), default=0)
        if self.seen["motion"] is not None:
            fresh = [e for e in watched if e["start"] > self.seen["motion"]]
            if fresh:
                cams = sorted({names.get(e["camera"], e["camera"]) for e in fresh})
                self.icon.notify(f"Movimento em {', '.join(cams)}", "Casa · Câmeras")
                self.show_alert(max(fresh, key=lambda e: e["start"]))
        self.seen["motion"] = max(newest, self.seen["motion"] or 0)
        return motion.get("unseen", 0)

    # ---- alerta com foto ----
    def show_alert(self, event):
        """Janela de alerta acima do relógio com a foto do movimento; some sozinha em 25 s."""
        if not (self.alert and self.alert_ready) or self.visible:
            return  # painel aberto: a pessoa já está olhando
        try:
            width, height = ALERT_SIZE
            scale = ctypes.windll.user32.GetDpiForSystem() / 96
            _, _, right, bottom = work_area()
            self.alert.resize(width, height)
            self.alert.move(round(right / scale) - width - MARGIN, round(bottom / scale) - height - MARGIN)
            target = "alerta:%s:%s:%d" % (event["camera"], event["id"], int(event["start"]))
            self.alert.evaluate_js(f"location.hash = {json.dumps(target)}")
            self.alert.show()
            if self.alert_hwnd:
                # Por cima de tudo, sem tirar o foco de quem está digitando (SWP_NOACTIVATE).
                ctypes.windll.user32.SetWindowPos(self.alert_hwnd, -1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040)
        except webview.errors.WebViewException:
            return
        self.alert_generation += 1
        generation = self.alert_generation
        threading.Timer(ALERT_SECONDS, lambda: generation == self.alert_generation and self.hide_alert()).start()

    def hide_alert(self):
        if self.alert:
            try:
                self.alert.hide()
                self.alert.evaluate_js("location.hash = 'oculto'")
            except webview.errors.WebViewException:
                pass

    def on_alert_shown(self):
        try:
            self.alert_hwnd = int(self.alert.native.Handle.ToInt64())
            user32 = ctypes.windll.user32
            style = user32.GetWindowLongW(self.alert_hwnd, -20)
            user32.SetWindowLongW(self.alert_hwnd, -20, (style | 0x80 | 0x08000000) & ~0x40000)  # toolwindow, sem ativar
            preference = ctypes.c_int(2)
            ctypes.windll.dwmapi.DwmSetWindowAttribute(wintypes.HWND(self.alert_hwnd), 33, ctypes.byref(preference), ctypes.sizeof(preference))
        except Exception:
            pass

    def on_alert_loaded(self):
        if not self.alert_ready:
            self.alert_ready = True
            self.alert.hide()

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
            alerts += self.poll_motion()
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
        if self.window:
            self.window.destroy()

    def on_shown(self):
        try:
            self.hwnd = int(self.window.native.Handle.ToInt64())
            user32 = ctypes.windll.user32
            # Fora da barra de tarefas e do Alt+Tab, como os painéis da bandeja do Windows.
            style = user32.GetWindowLongW(self.hwnd, -20)
            user32.SetWindowLongW(self.hwnd, -20, (style | 0x80) & ~0x40000)  # WS_EX_TOOLWINDOW, sem WS_EX_APPWINDOW
            preference = ctypes.c_int(2)  # Cantos arredondados do Windows 11 (DWMWCP_ROUND)
            ctypes.windll.dwmapi.DwmSetWindowAttribute(wintypes.HWND(self.hwnd), 33, ctypes.byref(preference), ctypes.sizeof(preference))
        except Exception:
            pass

    def on_loaded(self):
        self.window.evaluate_js("window.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) window.pywebview && window.pywebview.api.hide(); })")
        if not self.ready:
            # Primeira carga terminou fora da tela: agora pode esconder sem perder a pintura do WebView2.
            self.ready = True
            if not self.visible:
                self.window.hide()
        elif self.visible:
            # A página recarregou (painel novo publicado) com o popup aberto: volta à aba certa.
            self.window.evaluate_js(f"location.hash = {json.dumps(self.tab)}")

    def watch_focus(self):
        """Fecha o popup quando outra janela recebe o foco (não depende da página ter carregado)."""
        user32 = ctypes.windll.user32
        while not self.stop.is_set():
            time.sleep(0.15)
            if not (self.visible and self.hwnd) or time.monotonic() - self.shown_at < 0.5:
                continue
            foreground = user32.GetAncestor(user32.GetForegroundWindow(), 2)  # GA_ROOT
            if foreground == self.hwnd:
                self.had_focus = True
            elif foreground and self.had_focus:
                # Só fecha depois de ter recebido o foco: um popup que o Windows não trouxe à frente não some sozinho.
                self.hide()

    def run(self):
        width, height = SIZE
        self.ready, self.hwnd, self.shown_at, self.had_focus = False, None, 0.0, False
        # Criada visível fora da tela: o WebView2 só pinta janelas que já foram mostradas uma vez.
        self.window = webview.create_window(
            "Casa Local", f"{self.url}/?tray=1#oculto", js_api=Api(self), width=width, height=height, x=-32000, y=-32000,
            frameless=True, easy_drag=False, on_top=True, resizable=False, background_color="#161618",
        )
        self.window.events.shown += self.on_shown
        self.window.events.loaded += self.on_loaded
        self.window.events.closing += lambda: (self.hide(), False)[1]
        width, height = ALERT_SIZE
        self.alert = webview.create_window(
            "Casa · Alerta", f"{self.url}/?tray=1&alerta=1#oculto", js_api=AlertApi(self), width=width, height=height, x=-32000, y=-32000,
            frameless=True, easy_drag=False, on_top=True, resizable=False, focus=False, background_color="#161618",
        )
        self.alert.events.shown += self.on_alert_shown
        self.alert.events.loaded += self.on_alert_loaded
        self.alert.events.closing += lambda: (self.hide_alert(), False)[1]
        self.icon.run_detached()
        threading.Thread(target=self.poll, daemon=True).start()
        threading.Thread(target=self.watch_focus, daemon=True).start()
        threading.Thread(target=self.hotkey, daemon=True).start()
        # O Windows registra o ícone em NotifyIconSettings com atraso; tenta fixá-lo nos primeiros minutos.
        def keep_pinning():
            for _ in range(12):
                pin_icons()
                if self.stop.wait(15):
                    return
        threading.Thread(target=keep_pinning, daemon=True).start()
        webview.start(private_mode=False, storage_path=str(Path.home() / "AppData" / "Local" / "CasaLocalBandeja" / "webview"))


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
