"""Cadastro do ar com perfil Geonav: cobertura, modo sem temperatura e erros. Sinais sintéticos;
o envio IR é sempre substituído por mock — nenhum teste fala com a central."""
import base64
import json
import struct
import tempfile
import unittest
from unittest.mock import patch

from backend import adapters
from backend.adapters import climate_code_key
from backend.app import CasaApp
from backend.ir_codes import climate_summary, samsung_candidates
from backend.models import AppError

FAKE_KEY = "0123456789abcdef"


def code(seed):
    return base64.b64encode(struct.pack("<4H", 9000, 4500, 560 + seed, 560)).decode()


def profile_schema():
    """Mesma forma do perfil importado: 5 modos × 4 ventilações × 17–30 °C; auto sem temperatura."""
    schema = {"off": {"code": code(0), "origem": "geonav-perfil", "validado": False}}
    for m, mode in enumerate(("cool", "heat", "auto", "fan", "dry")):
        for f, fan in enumerate(("auto", "low", "medium", "high")):
            for t in range(17, 31):
                seed = 1 + m * 100 + f * 20 + (0 if mode == "auto" else t - 16)
                schema[climate_code_key({"power": True, "temperature": t, "mode": mode, "fan": fan})] = {"code": code(seed), "origem": "geonav-perfil", "validado": False}
    return schema


def ir_config(schema):
    return {"providerId": "testirhub00000000001", "ip": "192.168.0.65", "localKey": FAKE_KEY, "protocol": 3.3, "adapter": "ir", "controlType": 2, "schema": schema}


class SummaryTests(unittest.TestCase):
    def test_coverage_templess_and_origins(self):
        summary = climate_summary(profile_schema())
        self.assertEqual(summary["off"], "geonav-perfil")
        self.assertEqual(summary["origins"], {"geonav-perfil": 281})
        self.assertEqual(summary["coverage"]["cool"]["high"], list(range(17, 31)))
        self.assertEqual(summary["templess"], ["auto/auto", "auto/high", "auto/low", "auto/medium"])

    def test_learned_auto_with_distinct_temperatures_is_not_templess(self):
        schema = profile_schema()
        for t in range(17, 31):
            schema[climate_code_key({"power": True, "temperature": t, "mode": "auto", "fan": "low"})] = {"code": code(900 + t), "origem": "aprendido", "validado": False}
        self.assertNotIn("auto/low", climate_summary(schema)["templess"])

    def test_single_learned_state_is_not_reported_as_templess(self):
        schema = {climate_code_key({"power": True, "temperature": 24, "mode": "cool", "fan": "auto"}): code(1)}
        summary = climate_summary(schema)
        self.assertEqual(summary["templess"], [])
        self.assertIsNone(summary["off"])

    def test_snapshot_sends_summary_not_codes(self):
        schema = profile_schema()
        with tempfile.TemporaryDirectory() as data:
            app = CasaApp(mode="local", data_dir=data, config={"ar-quarto": ir_config(schema), "tv-quarto": ir_config(samsung_candidates())})
            raw = json.dumps(app.snapshot())
            climate = next(d for d in app.snapshot()["devices"] if d["id"] == "ar-quarto")
        self.assertNotIn("irKeys", climate)
        self.assertIn("auto/auto", climate["irClimate"]["templess"])
        self.assertLess(len(raw), 8000)
        for entry in list(schema.values())[:20]:
            self.assertNotIn(entry["code"], raw)
        self.assertNotIn(FAKE_KEY, raw)


class SendGuardTests(unittest.TestCase):
    def send(self, values, current, schema=None):
        with patch("tinytuya.Contrib.IRRemoteControlDevice.IRRemoteControlDevice.send_button") as button, \
             patch("tinytuya.Device.set_retry"), patch("tinytuya.Device.close"):
            try:
                result = adapters.send(ir_config(schema or profile_schema()), {"action": "set", "values": values}, current)
            except AppError as error:
                return error, button
        return result, button

    def test_temperature_change_in_auto_is_refused_without_sending(self):
        current = {"power": True, "temperature": 24, "mode": "auto", "fan": "auto"}
        error, button = self.send({"temperature": 25}, current)
        self.assertIsInstance(error, AppError)
        self.assertEqual(error.code, "temperature_not_encoded")
        button.assert_not_called()

    def test_temperature_change_in_cool_is_sent_once(self):
        result, button = self.send({"temperature": 25}, {"power": True, "temperature": 24, "mode": "cool", "fan": "auto"})
        self.assertEqual(result["status"], "sent")
        button.assert_called_once()

    def test_switching_to_auto_is_sent(self):
        result, button = self.send({"mode": "auto"}, {"power": True, "temperature": 24, "mode": "cool", "fan": "auto"})
        self.assertEqual(result["status"], "sent")
        button.assert_called_once()

    def test_missing_state_names_the_combination_in_portuguese(self):
        schema = {k: v for k, v in profile_schema().items() if "\"high\"" not in k}
        error, button = self.send({"fan": "high"}, {"power": True, "temperature": 24, "mode": "cool", "fan": "auto"}, schema)
        self.assertEqual(error.code, "ir_not_learned")
        self.assertIn("24 °C · resfriar · ventilação alta", str(error))
        button.assert_not_called()

    def test_missing_off_is_explicit(self):
        schema = {k: v for k, v in profile_schema().items() if k != "off"}
        error, button = self.send({"power": False}, {"power": True, "temperature": 24, "mode": "cool", "fan": "auto"}, schema)
        self.assertIn("desligar", str(error))
        button.assert_not_called()

    def test_tv_key_without_code(self):
        with patch("tinytuya.Contrib.IRRemoteControlDevice.IRRemoteControlDevice.send_button") as button:
            with self.assertRaises(AppError) as error:
                adapters.send(ir_config({}), {"action": "key", "key": "mute"}, {})
        self.assertIn("tecla", str(error.exception))
        button.assert_not_called()


class LearnPrecedenceTests(unittest.TestCase):
    def test_learning_overrides_profile_entry(self):
        schema = profile_schema()
        state = {"power": True, "temperature": 23, "mode": "cool", "fan": "auto"}
        with tempfile.TemporaryDirectory() as data:
            app = CasaApp(mode="local", data_dir=data, config={"ar-quarto": ir_config(schema)})
            with patch("backend.adapters.learn", return_value=code(777)), patch("backend.app.save_config"):
                result = app.learn("ar-quarto", {"state": state})
        entry = app.config["ar-quarto"]["schema"][climate_code_key(state)]
        self.assertEqual((entry["origem"], entry["code"]), ("aprendido", code(777)))
        climate = next(d for d in result["state"]["devices"] if d["id"] == "ar-quarto")
        self.assertEqual(climate["irClimate"]["origins"], {"geonav-perfil": 280, "aprendido": 1})


if __name__ == "__main__":
    unittest.main()


class ExtraKeyTests(unittest.TestCase):
    def test_learn_turbo_then_send_once_keeping_estimate(self):
        with tempfile.TemporaryDirectory() as data:
            app = CasaApp(mode="local", data_dir=data, config={"ar-quarto": ir_config(profile_schema())})
            with patch("backend.adapters.learn", return_value=code(555)), patch("backend.app.save_config"):
                result = app.learn("ar-quarto", {"key": "turbo"})
            climate = next(d for d in result["state"]["devices"] if d["id"] == "ar-quarto")
            self.assertEqual(climate["irClimate"]["extras"], {"turbo": "aprendido"})
            self.assertNotIn(code(555), json.dumps(result))
            with patch("tinytuya.Contrib.IRRemoteControlDevice.IRRemoteControlDevice.send_button") as button, \
                 patch("tinytuya.Device.set_retry"), patch("tinytuya.Device.close"):
                sent = adapters.send(app.config["ar-quarto"], {"action": "key", "key": "turbo"}, {"power": True, "temperature": 24, "mode": "cool", "fan": "high"})
            button.assert_called_once_with(code(555))
            self.assertEqual(sent["confidence"], "estimated")

    def test_unlearned_or_unknown_extra_is_refused(self):
        from backend.models import validate_command
        with self.assertRaises(AppError):
            validate_command("climate", {"action": "key", "key": "autodestruir"})
        with patch("tinytuya.Contrib.IRRemoteControlDevice.IRRemoteControlDevice.send_button") as button:
            with self.assertRaises(AppError):
                adapters.send(ir_config(profile_schema()), {"action": "key", "key": "eco"}, {"power": True, "temperature": 24, "mode": "cool", "fan": "auto"})
        button.assert_not_called()

    def test_extras_do_not_break_config_validation(self):
        from backend.config import validate_config
        schema = {**profile_schema(), "turbo": {"code": code(1), "origem": "aprendido", "validado": False}}
        validate_config({"ar-quarto": ir_config(schema)})
        with self.assertRaises(AppError):
            validate_config({"ar-quarto": ir_config({**profile_schema(), "foguete": code(2)})})
