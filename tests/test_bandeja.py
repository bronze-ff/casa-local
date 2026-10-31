"""Janelas da bandeja: geometria, mensagens e o subprocesso que nasce no clique e sai ao esconder."""
from pathlib import Path
import sys
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tray"))
import casa_janela  # noqa: E402

FAKE = r"""
import os, sys
os.write(1, b"open:cameras:cam1\n")
for line in sys.stdin:
    if line.strip() == "hide":
        os.write(1, b"tab:clima\n")
        break
"""


class BandejaTest(unittest.TestCase):
    def test_popup_cabe_na_area_de_trabalho_e_o_alerta_fica_no_canto(self):
        work = (0, 0, 1920, 1040)
        self.assertEqual(casa_janela.window_rect("popup", work, 1.0), (440, 760, 1920 - 440 - 12, 1040 - 760 - 12))
        self.assertEqual(casa_janela.window_rect("alerta", work, 1.0), (390, 176, 1920 - 390 - 12, 1040 - 176 - 12))
        # Tela baixa (150% de escala): o popup encolhe para não passar da área de trabalho.
        width, height, x, y = casa_janela.window_rect("popup", (0, 0, 1920, 900), 1.5)
        self.assertEqual((width, height, y), (440, 576, 600 - 576 - 12))

    def test_endereco_do_navegador_nao_leva_tray_e_valida_o_alvo(self):
        base = "http://127.0.0.1:8787"
        self.assertEqual(casa_janela.browser_url(base, ""), base + "/#/")
        self.assertEqual(casa_janela.browser_url(base + "/", "cameras/cam3"), base + "/#/cameras/cam3")
        self.assertEqual(casa_janela.browser_url(base, "#/luzes"), base + "/#/luzes")
        self.assertNotIn("tray", casa_janela.browser_url(base, "lab"))
        self.assertIsNone(casa_janela.browser_url(base, "x" * 80))
        self.assertIsNone(casa_janela.browser_url(base, None))

    def test_mensagens_da_janela(self):
        self.assertEqual(casa_janela.parse_message("tab:clima\n"), ("tab", "clima"))
        self.assertEqual(casa_janela.parse_message("open:cameras:cam1"), ("open", "cameras:cam1"))
        for ruim in ("tab:", "x:y", "", "lixo"):
            self.assertIsNone(casa_janela.parse_message(ruim))

    def test_processo_sai_ao_esconder_e_devolve_a_aba(self):
        tabs, opened, exited = [], [], threading.Event()
        janela = casa_janela.Janela("popup", "http://x", tabs.append, opened.append, lambda proc: exited.set(),
                                    command=[sys.executable, "-c", FAKE])
        self.assertFalse(janela.alive())
        self.assertFalse(janela.send("luzes"))  # fechada: o chamador deve abrir
        janela.start("luzes")
        self.assertTrue(janela.alive())
        self.assertTrue(janela.send("cameras:cam2"))
        janela.stop()
        self.assertTrue(exited.wait(10))
        self.assertEqual(tabs, ["clima"])
        self.assertEqual(opened, ["cameras:cam1"])
        self.assertFalse(janela.alive())
        self.assertFalse(janela.send("luzes"))

    def test_janela_fechando_conta_como_fechada(self):
        janela = casa_janela.Janela("popup", "http://x", lambda tab: None, lambda alvo: None, lambda proc: None, command=[sys.executable, "-c", FAKE])
        janela.start("luzes")
        janela.stop()
        self.assertFalse(janela.alive())  # o próximo clique abre outra, sem ser engolido
        self.assertFalse(janela.send("luzes"))
        janela.start("luzes")
        self.assertTrue(janela.alive())
        janela.stop()


if __name__ == "__main__":
    unittest.main()
