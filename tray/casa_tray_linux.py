"""Casa Local na bandeja do Linux (Hyprland/end4-pC): substitui casa_tray.py, que e so Windows.

- Clique: abre/fecha o painel numa janela flutuante (casa-painel). Ctrl+Alt+H faz o mesmo.
- Botao direito: abrir painel, abrir pelo Tailscale no navegador, reiniciar servicos, sair.
- Icone com bolinha: verde quando /api/status responde, vermelha quando o painel caiu.
"""
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QAction, QColor, QIcon, QPainter, QPixmap
from PyQt6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

LOCAL = "http://127.0.0.1:8787"
TAILNET = "https://desktop-daa9sqh.tail634fb2.ts.net"
ICON = Path(__file__).resolve().parent.parent / "web" / "public" / "icon-192.png"
TOGGLE = str(Path.home() / ".local" / "bin" / "casa-painel")


def painel_ok():
    try:
        with urllib.request.urlopen(LOCAL + "/api/status", timeout=3) as r:
            return json.load(r).get("configuredCount") is not None
    except Exception:
        return False


def icone(ok):
    base = QPixmap(str(ICON)).scaled(64, 64, Qt.AspectRatioMode.KeepAspectRatio,
                                     Qt.TransformationMode.SmoothTransformation)
    p = QPainter(base)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    p.setBrush(QColor("#2ecc71" if ok else "#e74c3c"))
    p.setPen(QColor("#00000000"))
    p.drawEllipse(42, 42, 20, 20)
    p.end()
    return QIcon(base)


def rodar(*cmd):
    subprocess.Popen(cmd, start_new_session=True)


def main():
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    tray = QSystemTrayIcon()

    menu = QMenu()
    for texto, acao in (
        ("Abrir painel", lambda: rodar(TOGGLE)),
        ("Abrir pelo Tailscale (navegador)", lambda: rodar("xdg-open", TAILNET)),
        ("Reiniciar painel e câmeras", lambda: rodar("systemctl", "restart", "casalocal", "go2rtc")),
    ):
        a = QAction(texto, menu)
        a.triggered.connect(acao)
        menu.addAction(a)
    menu.addSeparator()
    sair = QAction("Sair da bandeja", menu)
    sair.triggered.connect(app.quit)
    menu.addAction(sair)
    tray.setContextMenu(menu)

    def clicou(motivo):
        if motivo == QSystemTrayIcon.ActivationReason.Trigger:
            rodar(TOGGLE)

    tray.activated.connect(clicou)

    def atualizar():
        ok = painel_ok()
        tray.setIcon(icone(ok))
        tray.setToolTip("Casa Local · " + ("ok" if ok else "painel fora do ar"))

    atualizar()
    tray.show()
    timer = QTimer()
    timer.timeout.connect(atualizar)
    timer.start(30_000)
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
