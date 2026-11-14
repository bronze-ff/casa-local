"""Janela do painel da bandeja (popup ou alerta de movimento), num processo próprio.

A bandeja não carrega o WebView2: cada janela é um subprocesso (`pythonw casa_janela.py popup|alerta
URL ALVO`) que nasce no clique e sai ao esconder, devolvendo toda a memória do WebView2 ao Windows.

Conversa com a bandeja por linhas de texto:
- bandeja -> janela (stdin): `hide` fecha; qualquer outra linha é o novo alvo (location.hash);
- janela -> bandeja (stdout): `tab:<aba>` ao fechar o popup; `open:<alvo>` quando o alerta pede o painel.
"""
import ctypes
from ctypes import wintypes
import json
import os
import subprocess
import sys
import threading
import time
import webbrowser

MARGIN = 12
# O popup abre do tamanho de um tablet em pé (o painel usa o layout de tablet a partir de 760 px de largura);
# em tela pequena encolhe até caber e, abaixo de 760, o painel cai sozinho no layout compacto da bandeja.
SIZES = {"popup": (880, 1000), "alerta": (390, 176)}
ALERT_SECONDS = 25  # o alerta some sozinho


def window_rect(kind, work, scale):
    """(largura, altura, x, y) em pixels lógicos, no canto inferior direito da área de trabalho."""
    width, height = SIZES[kind]
    left, top, right, bottom = work
    if kind == "popup":
        width = min(width, round((right - left) / scale) - 2 * MARGIN)
        height = min(height, round((bottom - top) / scale) - 2 * MARGIN)
    return width, height, round(right / scale) - width - MARGIN, round(bottom / scale) - height - MARGIN


def parse_message(line):
    kind, _, value = line.strip().partition(":")
    return (kind, value) if kind in {"tab", "open"} and value else None


class Janela:
    """Lado da bandeja: dono do subprocesso de uma janela."""

    def __init__(self, kind, url, on_tab, on_open, on_exit, command=None):
        self.kind, self.url, self.on_tab, self.on_open, self.on_exit = kind, url, on_tab, on_open, on_exit
        self.command = command or [sys.executable, os.path.abspath(__file__)]
        self.proc, self.closing = None, False
        self.lock = threading.Lock()

    def alive(self):
        """Aberta e sem ter pedido para fechar (já fechando, um novo clique deve abrir outra)."""
        return self.proc is not None and self.proc.poll() is None and not self.closing

    def start(self, target):
        with self.lock:
            if self.alive():
                return
            self.closing = False
            self.proc = subprocess.Popen([*self.command, self.kind, self.url, target], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                         stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            threading.Thread(target=self._read, args=(self.proc,), daemon=True).start()

    def send(self, line):
        """Escreve uma linha para a janela; False se ela não está aberta."""
        with self.lock:
            if not self.alive():
                return False
            try:
                self.proc.stdin.write((line + "\n").encode())
                self.proc.stdin.flush()
                return True
            except OSError:
                return False

    def stop(self):
        """Pede para a janela fechar; se ela não sair em 3 s, encerra o processo."""
        proc = self.proc
        if self.send("hide"):
            self.closing = True
            killer = threading.Timer(3, lambda: proc.poll() is None and proc.kill())
            killer.daemon = True
            killer.start()

    def _read(self, proc):
        for raw in proc.stdout:
            message = parse_message(raw.decode("utf-8", "replace"))
            if message:
                self.closing = True  # a janela está saindo
            if message and message[0] == "tab":
                self.on_tab(message[1])
            elif message:
                self.on_open(message[1])
        proc.wait()
        self.on_exit(proc)


# ---- lado da janela (subprocesso) ----
def emit(line):
    try:
        os.write(1, (line + "\n").encode())
    except OSError:
        pass


def work_area():
    rect = wintypes.RECT()
    ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0)  # SPI_GETWORKAREA
    return rect.left, rect.top, rect.right, rect.bottom


def browser_url(url, alvo):
    """Endereço do painel completo no navegador: sem ?tray, alvo vazio = Início. None se o alvo não for texto curto."""
    if not isinstance(alvo, str) or len(alvo) >= 80:
        return None
    return f"{url.rstrip('/')}/#/{alvo.lstrip('#/')}"


def main(kind, url, target):
    import webview

    alert = kind == "alerta"
    user32 = ctypes.windll.user32
    width, height, x, y = window_rect(kind, work_area(), user32.GetDpiForSystem() / 96)  # pywebview usa pixels lógicos
    state = {"hwnd": None, "had_focus": False, "shown_at": 0.0, "timer": None, "closing": False}

    def finish():
        if state["closing"]:
            return
        state["closing"] = True
        if not alert:
            try:
                emit("tab:" + str(window.evaluate_js("location.hash.slice(1)") or "").split(":")[0])
            except webview.errors.WebViewException:
                pass
        try:
            window.destroy()
        except webview.errors.WebViewException:
            pass

    class Api:
        """Exposto à página: Esc/foco fecham o popup; o alerta pode ser dispensado ou abrir o painel."""

        def hide(self):
            finish()

        def dismiss(self):
            finish()

        def open(self, alvo):
            if isinstance(alvo, str) and len(alvo) < 80:
                emit("open:" + alvo)
                finish()

        def open_browser(self, alvo=""):
            """Só no popup: abre o painel inteiro no navegador padrão e fecha a janela."""
            link = None if alert else browser_url(url, alvo)
            if link:
                webbrowser.open(link)
                finish()

    def rearm():
        if state["timer"]:
            state["timer"].cancel()
        state["timer"] = threading.Timer(ALERT_SECONDS, finish)
        state["timer"].start()

    def navigate(alvo):
        window.evaluate_js(f"location.hash = {json.dumps(alvo)}")
        if alert:
            rearm()

    def on_shown():
        try:
            hwnd = state["hwnd"] = int(window.native.Handle.ToInt64())
            style = user32.GetWindowLongW(hwnd, -20)
            # Fora da barra de tarefas e do Alt+Tab; o alerta também não rouba o foco (WS_EX_NOACTIVATE).
            user32.SetWindowLongW(hwnd, -20, (style | 0x80 | (0x08000000 if alert else 0)) & ~0x40000)
            preference = ctypes.c_int(2)  # cantos arredondados do Windows 11
            ctypes.windll.dwmapi.DwmSetWindowAttribute(wintypes.HWND(hwnd), 33, ctypes.byref(preference), ctypes.sizeof(preference))
            state["shown_at"] = time.monotonic()
            if alert:
                user32.SetWindowPos(hwnd, -1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040)  # por cima, sem ativar
                rearm()
            else:
                user32.SetForegroundWindow(hwnd)
        except Exception:
            pass

    def on_loaded():
        if not alert:
            window.evaluate_js("window.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) window.pywebview && window.pywebview.api.hide(); })")

    def watch_focus():
        """Fecha o popup quando outra janela recebe o foco (só depois de ele ter tido o foco)."""
        while not state["closing"]:
            time.sleep(0.15)
            if not state["hwnd"] or time.monotonic() - state["shown_at"] < 0.5:
                continue
            foreground = user32.GetAncestor(user32.GetForegroundWindow(), 2)  # GA_ROOT
            if foreground == state["hwnd"]:
                state["had_focus"] = True
            elif foreground and state["had_focus"]:
                finish()

    def read_commands():
        for raw in open(0, "rb"):  # sys.stdin é None no pythonw
            line = raw.decode("utf-8-sig", "replace").strip()
            if line == "hide":
                break
            if line:
                navigate(line)
        finish()  # "hide" ou a bandeja saiu (stdin fechou)

    query = "?tray=1&alerta=1" if alert else "?tray=1"
    window = webview.create_window(
        "Casa · Alerta" if alert else "Casa Local", f"{url}/{query}#{target}", js_api=Api(), width=width, height=height, x=x, y=y,
        frameless=True, easy_drag=False, on_top=True, resizable=False, focus=not alert, background_color="#2E2E2D",
    )
    window.events.shown += on_shown
    window.events.loaded += on_loaded
    threading.Thread(target=read_commands, daemon=True).start()
    if not alert:
        threading.Thread(target=watch_focus, daemon=True).start()
    webview.start(private_mode=False, storage_path=os.path.join(os.path.expanduser("~"), "AppData", "Local", "CasaLocalBandeja", "webview"))


if __name__ == "__main__":
    main(*sys.argv[1:4])
