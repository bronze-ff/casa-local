"""Casa Local na bandeja do Windows: três ícones fixos (Ar, Lâmpadas e dispositivos, Câmeras),
cada um abre o seu painel acima do relógio, como os painéis do Windows 11.

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
POLL_SECONDS = 20
DOT = {"ok": (58, 211, 122), "aviso": (255, 181, 71), "fora": (255, 97, 89), "?": (157, 157, 166)}
WHITE = (255, 255, 255)


def tile(color):
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    pen = ImageDraw.Draw(image)
    pen.rounded_rectangle((2, 2, 62, 62), radius=16, fill=color)
    return image, pen


def glyph_ac():
    image, pen = tile((47, 124, 255))
    pen.rounded_rectangle((9, 13, 55, 31), radius=6, fill=WHITE)
    pen.rounded_rectangle((15, 25, 49, 28), radius=2, fill=(47, 124, 255))
    for x, lean in ((20, -3), (32, 0), (44, 3)):
        pen.line((x, 36, x + lean, 50), fill=WHITE, width=4)
    return image


def glyph_bulb():
    image, pen = tile((240, 160, 32))
    pen.ellipse((17, 8, 47, 38), fill=WHITE)
    pen.polygon([(22, 31), (42, 31), (38, 42), (26, 42)], fill=WHITE)
    pen.rounded_rectangle((25, 44, 39, 48), radius=2, fill=WHITE)
    pen.rounded_rectangle((27, 51, 37, 55), radius=2, fill=WHITE)
    return image


def glyph_camera():
    image, pen = tile((143, 123, 255))
    pen.rounded_rectangle((8, 19, 44, 45), radius=7, fill=WHITE)
    pen.ellipse((18, 24, 34, 40), fill=(143, 123, 255))
    pen.ellipse((22, 28, 30, 36), fill=WHITE)
    pen.polygon([(46, 26), (57, 19), (57, 45), (46, 38)], fill=WHITE)
    return image


PANELS = {
    "clima": {"title": "Ar-condicionado", "size": (380, 560), "glyph": glyph_ac, "hash": "clima"},
    "dispositivos": {"title": "Lâmpadas e dispositivos", "size": (400, 700), "glyph": glyph_bulb, "hash": "luzes"},
    "cameras": {"title": "Câmeras", "size": (600, 620), "glyph": glyph_camera, "hash": "cameras"},
}


def with_status(base, state):
    image = base.copy()
    pen = ImageDraw.Draw(image)
    pen.ellipse((41, 41, 63, 63), fill=(22, 22, 24))
    pen.ellipse((44, 44, 60, 60), fill=DOT[state])
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
    """Windows 11 esconde ícones novos na setinha ^; marca os da Casa como sempre visíveis."""
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
                    if exe.endswith("pythonw.exe") and tip.startswith("Casa ·"):
                        winreg.SetValueEx(entry, "IsPromoted", 0, winreg.REG_DWORD, 1)
    except OSError:
        pass


class Api:
    """Exposto ao painel: o popup se esconde ao perder o foco, como os painéis do Windows."""

    def __init__(self, tray):
        self._tray = tray

    def hide(self):
        self._tray.hide()


class Tray:
    def __init__(self, url, services):
        self.url = url.rstrip("/")
        self.services = Path(services) if services else None
        self.server_state = "?"
        self.camera_state = "?"
        self.current = None
        self.visible = False
        self.hidden_at = 0.0
        self.device_tab = "luzes"
        self.stop = threading.Event()
        self.window = None
        self.icons = {key: pystray.Icon(f"casa-{key}", with_status(panel["glyph"](), "?"), f"Casa · {panel['title']}", menu=self.menu(key)) for key, panel in PANELS.items()}

    def label(self, key):
        if self.server_state == "fora":
            return "Central indisponível"
        if key == "cameras":
            return "Câmeras funcionando" if self.camera_state == "ok" else "Câmeras paradas" if self.camera_state == "aviso" else "Verificando…"
        return "Central funcionando" if self.server_state == "ok" else "Verificando…"

    def menu(self, key):
        items = [
            pystray.MenuItem(f"Abrir {PANELS[key]['title'].lower()}", lambda: self.show(key), default=True),
            pystray.MenuItem("Abrir no navegador", lambda: webbrowser.open(f"{self.url}/#{PANELS[key]['hash']}")),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(lambda _: self.label(key), None, enabled=False),
        ]
        if self.services:
            items.append(pystray.MenuItem("Reiniciar serviços", lambda: threading.Thread(target=self.restart, daemon=True).start()))
        items += [
            pystray.MenuItem("Iniciar com o Windows", lambda: set_autostart(not autostart_enabled()), checked=lambda _: autostart_enabled()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Sair da Casa", self.quit),
        ]
        return pystray.Menu(*items)

    def show(self, key):
        try:
            self._show(key)
        except webview.errors.WebViewException:
            pass  # janela ainda iniciando; o próximo clique abre normalmente

    def _show(self, key):
        if not self.window:
            return
        # Clicar no ícone com o popup aberto tira o foco antes do clique chegar: trate como "fechar".
        recently_hidden = time.monotonic() - self.hidden_at < 0.6
        if self.current == key and (self.visible or recently_hidden):
            self.hide()
            return
        width, height = PANELS[key]["size"]
        scale = ctypes.windll.user32.GetDpiForSystem() / 96  # pywebview usa pixels lógicos
        _, _, right, bottom = work_area()
        self.window.resize(width, height)
        self.window.move(round(right / scale) - width - MARGIN, round(bottom / scale) - height - MARGIN)
        target = self.device_tab if key == "dispositivos" else PANELS[key]["hash"]
        self.window.evaluate_js(f"location.hash = {json.dumps(target)}")
        self.current = key
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
                if self.current == "dispositivos":
                    tab = self.window.evaluate_js("location.hash.slice(1)")
                    self.device_tab = tab if tab in ("luzes", "tv") else "luzes"
                # Página "dorme": câmeras, vídeo ao vivo e cena 3D são desmontados enquanto o popup está fechado.
                self.window.evaluate_js("location.hash = 'oculto'")
            except webview.errors.WebViewException:
                pass

    def restart(self):
        script = self.services / "scripts" / "reiniciar-inicio.ps1"
        self.icons["dispositivos"].notify("Reiniciando painel e câmeras…", "Casa Local")
        subprocess.run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)], creationflags=subprocess.CREATE_NO_WINDOW, timeout=90, check=False)
        self.poll_once()
        self.icons["dispositivos"].notify(self.label("dispositivos") + " · " + self.label("cameras"), "Casa Local")

    def fetch(self, path):
        request = urllib.request.Request(self.url + path, headers={"Cache-Control": "no-store"})
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.loads(response.read(65536))

    def poll_once(self):
        try:
            self.fetch("/api/status")
            server = "ok"
            try:
                cameras = "ok" if self.fetch("/api/cameras").get("available") else "aviso"
            except (OSError, ValueError):
                cameras = "aviso"
        except (OSError, ValueError):
            server, cameras = "fora", "fora"
        if (server, cameras) != (self.server_state, self.camera_state):
            self.server_state, self.camera_state = server, cameras
            for key, icon in self.icons.items():
                state = cameras if key == "cameras" else server
                icon.icon = with_status(PANELS[key]["glyph"](), state)
                icon.title = f"Casa · {PANELS[key]['title']} · {self.label(key)}"
                icon.update_menu()

    def poll(self):
        while not self.stop.is_set():
            self.poll_once()
            self.stop.wait(POLL_SECONDS)

    def quit(self):
        self.stop.set()
        for icon in self.icons.values():
            icon.stop()
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
        elif self.visible and self.current:
            # A página recarregou (painel novo publicado) com o popup aberto: volta ao painel certo.
            target = self.device_tab if self.current == "dispositivos" else PANELS[self.current]["hash"]
            self.window.evaluate_js(f"location.hash = {json.dumps(target)}")

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
        width, height = PANELS["dispositivos"]["size"]
        self.ready, self.hwnd, self.shown_at, self.had_focus = False, None, 0.0, False
        # Criada visível fora da tela: o WebView2 só pinta janelas que já foram mostradas uma vez.
        self.window = webview.create_window(
            "Casa Local", f"{self.url}/?tray=1#oculto", js_api=Api(self), width=width, height=height, x=-32000, y=-32000,
            frameless=True, easy_drag=False, on_top=True, resizable=False, background_color="#1f1f22",
        )
        self.window.events.shown += self.on_shown
        self.window.events.loaded += self.on_loaded
        self.window.events.closing += lambda: (self.hide(), False)[1]
        threading.Thread(target=self.poll, daemon=True).start()
        threading.Thread(target=self.watch_focus, daemon=True).start()
        # Ordem da direita para a esquerda ao lado do relógio: câmeras, dispositivos, ar.
        for key in ("clima", "dispositivos", "cameras"):
            self.icons[key].run_detached()
        # O Windows registra os ícones em NotifyIconSettings com atraso; tenta fixá-los nos primeiros minutos.
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
