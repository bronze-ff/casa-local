"""Modos editáveis, rotinas por lugar e regra de alerta por computador, sem rede nem aparelhos."""
from datetime import datetime
import json
from pathlib import Path
import tempfile
import unittest

from backend.alert_devices import PAUSE_FOREVER, AlertDevices
from backend.app import CasaApp
from backend.models import AppError
from backend.modes import Modes
from backend.routines import Routines


class Clock:
    def __init__(self, moment):
        self.now = moment.timestamp()

    def __call__(self):
        return self.now


class Temp(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.dir = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()


LEITURA = {"name": "Leitura", "icon": "book", "steps": {
    "quarto-luz": {"power": True, "brightness": 50, "colorHex": "#ffd6a0"},
    "ar-quarto": {"power": True, "temperature": 23, "mode": "cool", "fan": "low", "keepIfOn": True}}}


class ModeTests(Temp):
    def test_defaults_come_from_old_scenes_with_custom_names(self):
        (self.dir / "scenes.json").write_text(json.dumps({"cinema": {"name": "Filme"}}), encoding="utf-8")
        modes = {m["id"]: m for m in Modes(self.dir).public()}
        self.assertEqual(set(modes), {"cinema", "boa-noite", "cheguei"})
        self.assertEqual(modes["cinema"]["name"], "Filme")
        self.assertEqual(modes["boa-noite"]["steps"]["ar-quarto"], {"power": False})
        self.assertEqual(modes["cinema"]["description"], "Quarto 15% · Banheiro apagada")

    def test_save_edit_reorder_remove_and_persist(self):
        modes = Modes(self.dir)
        created = next(m for m in modes.save(LEITURA) if m["name"] == "Leitura")
        self.assertEqual(created["steps"]["quarto-luz"]["colorHex"], "#FFD6A0")
        self.assertIn("(se desligado)", created["description"])
        with self.assertRaises(AppError):
            modes.save(LEITURA)  # nome repetido
        modes.save({**LEITURA, "id": created["id"], "name": "Ler"})
        ids = [m["id"] for m in modes.public()]
        modes.reorder(ids[::-1])
        again = Modes(self.dir)
        self.assertEqual([m["id"] for m in again.public()], ids[::-1])
        self.assertEqual(again.get(created["id"])["name"], "Ler")
        again.remove(created["id"])
        self.assertFalse(again.exists(created["id"]))

    def test_validation(self):
        modes = Modes(self.dir)
        bad = [
            {**LEITURA, "steps": {}},
            {**LEITURA, "icon": "rocket"},
            {**LEITURA, "steps": {"tv-quarto": {"power": False}}},
            {**LEITURA, "steps": {"quarto-luz": {"power": True, "brightness": 5, "colorHex": "#FFFFFF"}}},
            {**LEITURA, "steps": {"quarto-luz": {"power": False, "brightness": 50}}},
            {**LEITURA, "steps": {"ar-quarto": {"power": True, "temperature": 23, "mode": "cool", "fan": "low"}}},
            {**LEITURA, "steps": {"ar-quarto": {"power": True, "temperature": 35, "mode": "cool", "fan": "low", "keepIfOn": False}}},
        ]
        for body in bad:
            with self.subTest(body=body), self.assertRaises(AppError):
                modes.save(body)

    def test_run_keeps_ac_already_on_and_lights_go_first(self):
        app = CasaApp(data_dir=self.dir)
        mode_id = next(m["id"] for m in app.modes.save(LEITURA) if m["name"] == "Leitura")
        app.command("ar-quarto", {"action": "set", "values": {"power": True, "temperature": 20, "mode": "cool", "fan": "high"}})
        result = app.scene(mode_id)
        self.assertEqual([(r["deviceId"], r["status"]) for r in result["results"]], [("quarto-luz", "preview"), ("ar-quarto", "skipped")])
        self.assertEqual(result["status"], "preview")
        app.command("ar-quarto", {"action": "set", "values": {"power": False}})
        app.scene(mode_id)
        ac = next(d for d in app.snapshot()["devices"] if d["id"] == "ar-quarto")["state"]
        self.assertEqual((ac["power"], ac["temperature"], ac["fan"]), (True, 23, "low"))
        with self.assertRaises(AppError):
            app.scene("nao-existe")


class PlaceRoutineTests(Temp):
    def setUp(self):
        super().setUp()
        self.clock = Clock(datetime(2026, 10, 19, 18, 30))  # segunda-feira
        self.app = CasaApp(data_dir=self.dir)
        self.routines = Routines(self.app, self.dir, clock=self.clock, places=lambda: ["academia", "servico"])
        self.base = {"name": "Saindo da academia", "days": [0, 1, 2, 3, 4], "action": {"type": "scene", "id": "cheguei"},
                     "trigger": "place", "place": "academia", "event": "saiu", "between": ["17:00", "21:00"]}

    def event(self, kind="saiu", place="academia", age=30):
        self.routines.on_place({"tst": int(self.clock.now - age), "kind": kind, "place": place})

    def test_fires_on_matching_fresh_transition_once(self):
        self.routines.save(self.base)
        self.event(kind="chegou")
        self.event(place="servico")
        self.assertEqual(self.routines.due(), [])
        self.event()
        self.assertEqual([name for name, _, _ in self.routines.due()], ["Saindo da academia"])
        self.assertEqual(self.routines.due(), [])
        self.clock.now += 600
        self.event()  # o GPS oscilou na borda: não repete em 30 min
        self.assertEqual(self.routines.due(), [])
        self.clock.now += 1800
        self.event()
        self.assertEqual(len(self.routines.due()), 1)

    def test_window_days_and_stale_transitions(self):
        self.routines.save(self.base)
        self.event(age=900)  # fila antiga do celular
        self.assertEqual(self.routines.due(), [])
        self.event(age=-3600)  # relógio do celular adiantado
        self.assertEqual(self.routines.due(), [])
        self.clock.now = datetime(2026, 10, 19, 22, 0).timestamp()
        self.event()
        self.assertEqual(self.routines.due(), [])
        self.clock.now = datetime(2026, 10, 18, 18, 30).timestamp()  # domingo
        self.event()
        self.assertEqual(self.routines.due(), [])

    def test_window_across_midnight_and_no_window(self):
        self.routines.save({**self.base, "between": ["22:00", "02:00"]})
        self.clock.now = datetime(2026, 10, 20, 1, 0).timestamp()
        self.event()
        self.assertEqual(len(self.routines.due()), 1)
        routine = self.routines.status()["routines"][0]
        self.routines.save({**self.base, "id": routine["id"], "between": None, "days": list(range(7))})
        self.clock.now += 3600
        self.event()
        self.assertEqual(len(self.routines.due()), 1)

    def test_validation_and_switching_trigger(self):
        for body in ({**self.base, "place": "praia"}, {**self.base, "event": "passou"}, {**self.base, "between": ["10:00", "10:00"]},
                     {**self.base, "time": "07:00"}, {**self.base, "action": {"type": "scene", "id": "sumiu"}}):
            with self.subTest(body=body), self.assertRaises(AppError):
                self.routines.save(body)
        routine = self.routines.save(self.base)["routines"][0]
        self.assertEqual((routine["trigger"], routine["next"]), ("place", None))
        changed = self.routines.save({"id": routine["id"], "name": "Manhã", "days": [0], "action": {"type": "scene", "id": "cheguei"}, "time": "07:00"})["routines"][0]
        self.assertEqual(changed["trigger"], "time")
        self.assertNotIn("place", changed)


class AlertDeviceTests(Temp):
    def setUp(self):
        super().setUp()
        self.clock = Clock(datetime(2026, 10, 19, 20, 0))
        self.devices = AlertDevices(self.dir, cameras=lambda: {"cam1", "cam2"}, clock=self.clock)

    def test_hello_registers_with_default_rule_and_reports_busy(self):
        rule = self.devices.hello({"id": "0123456789abcdef", "name": "PC de casa", "busy": True})
        self.assertEqual((rule["mode"], rule["game"], rule["pausedUntil"]), ("watched", True, 0))
        listed = self.devices.status()["devices"][0]
        self.assertEqual((listed["online"], listed["busy"]), (True, True))
        self.clock.now += 120
        self.assertFalse(self.devices.status()["devices"][0]["online"])
        with self.assertRaises(AppError):
            self.devices.hello({"id": "nope"})

    def test_update_rules_and_persist(self):
        self.devices.hello({"id": "0123456789abcdef", "name": "Notebook"})
        self.devices.update("0123456789abcdef", {"mode": "some", "cameras": ["cam2"], "game": False, "name": "Notebook do serviço"})
        self.devices.update("0123456789abcdef", {"pausedUntil": PAUSE_FOREVER})
        again = AlertDevices(self.dir, cameras=lambda: {"cam1", "cam2"}, clock=self.clock)
        rule = again.hello({"id": "0123456789abcdef", "name": "outro nome"})
        self.assertEqual((rule["name"], rule["mode"], rule["cameras"], rule["game"], rule["pausedUntil"]), ("Notebook do serviço", "some", ["cam2"], False, PAUSE_FOREVER))
        for body in ({"mode": "talvez"}, {"cameras": ["cam9"]}, {"pausedUntil": int(self.clock.now) + 8 * 86400}, {"pausedUntil": 5}, {}):
            with self.subTest(body=body), self.assertRaises(AppError):
                again.update("0123456789abcdef", body)
        again.remove("0123456789abcdef")
        self.assertEqual(again.status()["devices"], [])


if __name__ == "__main__":
    unittest.main()
