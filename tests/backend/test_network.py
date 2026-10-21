"""Aparelhos na rede: base conhecida, aviso de novo, nomes e validação (varredura simulada)."""
from pathlib import Path
import tempfile
import unittest

from backend.models import AppError
from backend.network import Network


class NetworkTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.found = [{"ip": "192.168.0.1", "mac": "AA-BB-CC-00-00-01", "host": "router.lan"},
                      {"ip": "192.168.0.20", "mac": "aa-bb-cc-00-00-20", "host": "192.168.0.20"}]
        self.alerts = []
        self.now = 1_000_000
        self.net = self.make()

    def make(self):
        return Network(Path(self.temporary.name), scanner=lambda: {"gateway": "192.168.0.1", "devices": list(self.found)},
                       hints=lambda: {"192.168.0.20": "Luz do quarto"}, notify=self.alerts.append, clock=lambda: self.now)

    def tearDown(self):
        self.temporary.cleanup()

    def test_first_day_learns_quietly_then_new_device_alerts_once(self):
        self.assertEqual(self.net.scan(), [])
        self.found.append({"ip": "192.168.0.50", "mac": "AA-BB-CC-00-00-50", "host": "celular-dormindo"})
        self.now += 6 * 3600
        self.assertEqual(self.net.scan(), [], "nas primeiras 24 h só aprende (celular que acordou depois)")
        self.assertEqual(self.alerts, [])
        self.assertIsNotNone(self.net.status()["learningUntil"])
        self.now += 86400
        self.assertIsNone(self.net.status()["learningUntil"])
        self.found.append({"ip": "192.168.0.77", "mac": "02:11:22:33:44:55", "host": "celular-visita.lan"})
        new = self.net.scan()
        self.assertEqual([d["mac"] for d in new], ["02-11-22-33-44-55"])
        self.assertEqual(len(self.alerts), 1)
        self.assertTrue(self.alerts[0]["private"], "bit local ligado: MAC privado de celular")
        self.assertEqual(self.alerts[0]["host"], "celular-visita")
        self.net.scan()
        self.assertEqual(len(self.alerts), 1, "o mesmo aparelho não avisa de novo")
        status = self.net.status()
        self.assertEqual(status["unknown"], 1)
        self.assertEqual(status["devices"][0]["ip"], "192.168.0.77", "desconhecidos online primeiro")

    def test_labels_come_from_name_hint_gateway_or_host(self):
        self.net.scan()
        labels = {d["ip"]: d["label"] for d in self.net.status()["devices"]}
        self.assertEqual(labels, {"192.168.0.1": "Roteador", "192.168.0.20": "Luz do quarto"})
        self.net.update("aabbcc000020", {"name": "Abajur"})
        self.assertEqual({d["ip"]: d["label"] for d in self.net.status()["devices"]}["192.168.0.20"], "Abajur")

    def test_persists_and_marks_offline(self):
        self.net.scan()
        self.found.pop()
        again = self.make()
        self.assertEqual(again.status()["online"], 2, "a última varredura vale até a próxima")
        self.assertIsNotNone(again.status()["scanned"])
        again.scan()
        devices = {d["ip"]: d for d in again.status()["devices"]}
        self.assertFalse(devices["192.168.0.20"]["online"])
        self.assertTrue(devices["192.168.0.1"]["online"])

    def test_known_toggle_and_validation(self):
        self.net.scan()
        self.now += 86401
        self.found.append({"ip": "192.168.0.90", "mac": "10-20-30-40-50-60", "host": ""})
        self.net.scan()
        self.net.update("102030405060", {"known": True})
        self.assertEqual(self.net.status()["unknown"], 0)
        for body in ({}, {"known": "sim"}, {"name": "x" * 41}, {"cor": "azul"}):
            with self.assertRaises(AppError):
                self.net.update("102030405060", body)
        with self.assertRaises(AppError):
            self.net.update("ffffffffffff", {"known": True})
        self.net.remove("102030405060")
        self.assertNotIn("10-20-30-40-50-60", [d["mac"] for d in self.net.status()["devices"]])

    def test_bad_scan_keeps_list_and_reports_error(self):
        self.net.scan()
        self.net.scanner = lambda: None
        self.assertEqual(self.net.scan(), [])
        status = self.net.status()
        self.assertEqual(status["error"], "A varredura não respondeu.")
        self.assertEqual(len(status["devices"]), 2)

    def test_watched_device_alerts_after_two_misses_and_when_back(self):
        changes = []
        self.net.presence = lambda device, online: changes.append((device["label"], online))
        self.net.scan()
        lamp = self.found.pop()  # a luz (conhecida pela Casa) some
        self.net.scan()
        self.assertEqual(changes, [], "uma varredura sem resposta ainda não avisa")
        self.net.scan()
        self.net.scan()
        self.assertEqual(changes, [("Luz do quarto", False)], "avisa uma vez só")
        self.found.append(lamp)
        self.net.scan()
        self.assertEqual(changes[-1], ("Luz do quarto", True))
        self.net.update("aabbcc000020", {"watch": False})
        self.found.pop()
        self.net.scan()
        self.net.scan()
        self.assertEqual(len(changes), 2, "sem vigiar, não avisa")

    def test_garbage_rows_are_ignored(self):
        self.found.extend([{"ip": "x", "mac": "AA-BB-CC-00-00-99"}, {"ip": "192.168.0.5", "mac": "nada"}, "texto"])
        self.net.scan()
        self.assertEqual(len(self.net.status()["devices"]), 2)


if __name__ == "__main__":
    unittest.main()


class LearningMigrationTests(unittest.TestCase):
    def test_old_file_without_learning_counts_from_first_scan(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "rede.json").write_text('{"baseline": true, "devices": {"aabbcc000001": {"ip": "192.168.0.1", "firstSeen": 1000}}}', encoding="utf-8")
            net = Network(Path(folder), scanner=lambda: None, clock=lambda: 2000)
            self.assertEqual(net.learn_until, 1000 + 86400)
