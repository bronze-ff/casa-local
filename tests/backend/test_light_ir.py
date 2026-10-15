import base64
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

from backend import tuya_light
from backend.app import CasaApp
from backend.config import validate_config
from backend.ir_codes import SAMSUNG_TV, code_of, samsung32_pulses, samsung_candidates
from backend.models import AppError

# DPs reais reportados pelas lâmpadas em 15/10/2026 (izy-validation.json).
QUARTO = {"20": False, "21": "white", "22": 870, "23": 1000, "24": "000003e803de"}
BANHEIRO = {"20": False, "21": "white", "22": 1000, "23": 1000, "24": "010a03e803e8"}
FAKE_KEY = "0123456789abcdef"
CODE = base64.b64encode(struct.pack("<4H", 9000, 4500, 560, 560)).decode()


def ir_entry(schema=None):
    return {"providerId": "testirhub00000000001", "ip": "192.168.0.65", "localKey": FAKE_KEY, "protocol": 3.3, "adapter": "ir", "controlType": 2, "schema": schema or {}}


def light_entry():
    return {"providerId": "testlampquarto000001", "ip": "192.168.0.73", "localKey": FAKE_KEY, "protocol": 3.3, "adapter": "light", "schema": dict(tuya_light.DEFAULT_SCHEMA)}


class LightTests(unittest.TestCase):
    def test_decode_real_white_state(self):
        self.assertEqual(tuya_light.decode(QUARTO), {"power": False, "brightness": 87, "colorHex": "#FFFFFF"})
        self.assertEqual(tuya_light.decode(BANHEIRO)["brightness"], 100)

    def test_colour_mode_uses_value_of_dp24_not_dp22(self):
        dps = {**QUARTO, "21": "colour", "24": "00f003e801f4"}  # h=240 azul, v=500
        state = tuya_light.decode(dps)
        self.assertEqual(state["brightness"], 50)
        self.assertEqual(state["colorHex"], "#0000FF")

    def test_colour_switches_mode_and_keeps_brightness(self):
        payload = tuya_light.encode({"colorHex": "#2F6BFF"}, QUARTO)
        self.assertEqual(payload["21"], "colour")
        h, s, v = tuya_light.parse_colour(payload["24"])
        self.assertEqual(v, 870)
        self.assertNotIn("22", payload)

    def test_white_presets_use_white_mode_and_temperature(self):
        payload = tuya_light.encode({"colorHex": "#FFD6A0", "brightness": 40}, {**QUARTO, "21": "colour"})
        self.assertEqual(payload, {"21": "white", "23": 0, "22": 400})

    def test_brightness_follows_current_mode(self):
        self.assertEqual(tuya_light.encode({"brightness": 30}, QUARTO), {"22": 300})
        colour = {**QUARTO, "21": "colour", "24": "00f003e801f4"}
        self.assertEqual(tuya_light.encode({"brightness": 30}, colour), {"24": "00f003e8012c"})

    def test_brightness_never_below_schema_minimum(self):
        self.assertEqual(tuya_light.encode({"brightness": 0}, QUARTO), {"22": 10})

    def test_power_alone(self):
        self.assertEqual(tuya_light.encode({"power": True}, QUARTO), {"20": True})


class IRCodeTests(unittest.TestCase):
    def test_samsung32_framing(self):
        pulses = samsung32_pulses(SAMSUNG_TV["power"])
        self.assertEqual(len(pulses), 2 + 64 + 1)
        self.assertEqual(pulses[:2], [4500, 4500])
        self.assertEqual(pulses[2:4], [560, 1690])  # 0xE... começa com bit 1

    def test_candidates_are_marked_unvalidated(self):
        for entry in samsung_candidates().values():
            self.assertEqual((entry["origem"], entry["validado"]), ("samsung-padrao", False))
        config = {"tv-quarto": ir_entry(samsung_candidates())}
        self.assertIs(validate_config(config), config)


class ConfigTests(unittest.TestCase):
    def test_light_and_empty_ir_are_valid(self):
        validate_config({"quarto-luz": light_entry(), "ar-quarto": ir_entry(), "tv-quarto": ir_entry()})

    def test_light_schema_only_for_lamps(self):
        with self.assertRaises(AppError):
            validate_config({"tv-quarto": {**light_entry()}})

    def test_ac_accepts_off_and_canonical_states(self):
        state = json.dumps({"fan": "auto", "mode": "cool", "power": True, "temperature": 24}, sort_keys=True, separators=(",", ":"))
        validate_config({"ar-quarto": ir_entry({"off": {"code": CODE, "origem": "aprendido", "validado": False}, state: CODE})})
        with self.assertRaises(AppError):
            validate_config({"ar-quarto": ir_entry({"ligar": CODE})})

    def test_ir_entry_shape_is_strict(self):
        with self.assertRaises(AppError):
            validate_config({"tv-quarto": ir_entry({"power": {"code": CODE, "origem": "internet", "validado": False}})})


class LearnTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.data = Path(self.temporary.name)
        self.app = CasaApp(mode="local", data_dir=self.data, config={"tv-quarto": ir_entry(samsung_candidates()), "ar-quarto": ir_entry()})

    def tearDown(self):
        self.temporary.cleanup()

    def test_snapshot_exposes_origins_never_codes(self):
        snapshot = json.dumps(self.app.snapshot())
        self.assertIn('"irKeys"', snapshot)
        self.assertIn("samsung-padrao", snapshot)
        self.assertNotIn(samsung_candidates()["power"]["code"], snapshot)
        self.assertNotIn(FAKE_KEY, snapshot)

    def test_learn_replaces_candidate_and_saves(self):
        with patch("backend.adapters.learn", return_value=CODE), patch("backend.app.save_config") as save:
            result = self.app.learn("tv-quarto", {"key": "power"})
        self.assertEqual(result["learned"], "power")
        self.assertEqual(self.app.config["tv-quarto"]["schema"]["power"], {"code": CODE, "origem": "aprendido", "validado": False})
        save.assert_called_once()
        tv = next(d for d in result["state"]["devices"] if d["id"] == "tv-quarto")
        self.assertEqual(tv["irKeys"]["power"], "aprendido")

    def test_learn_climate_state_and_off(self):
        with patch("backend.adapters.learn", return_value=CODE), patch("backend.app.save_config"):
            self.app.learn("ar-quarto", {"state": {"power": True, "temperature": 23, "mode": "cool", "fan": "auto"}})
            self.app.learn("ar-quarto", {"key": "off"})
        self.assertEqual(len(self.app.config["ar-quarto"]["schema"]), 2)

    def test_learn_rejects_unknown_targets(self):
        for device, body in (("tv-quarto", {"key": "format_c"}), ("ar-quarto", {"state": {"power": False, "temperature": 23, "mode": "cool", "fan": "auto"}}), ("quarto-luz", {"key": "power"})):
            with self.assertRaises(AppError):
                self.app.learn(device, body)

    def test_unlearned_climate_state_is_refused_without_sending(self):
        from backend import adapters
        with patch("tinytuya.Contrib.IRRemoteControlDevice.IRRemoteControlDevice.send_button") as send:
            with self.assertRaises(AppError) as error:
                adapters.send(self.app.config["ar-quarto"], {"action": "set", "values": {"power": True}}, {"power": False, "temperature": 24, "mode": "cool", "fan": "auto"})
        self.assertEqual(error.exception.code, "ir_not_learned")
        send.assert_not_called()

    def test_off_code_used_for_any_state(self):
        from backend import adapters
        config = ir_entry({"off": {"code": CODE, "origem": "aprendido", "validado": False}})
        with patch("tinytuya.Contrib.IRRemoteControlDevice.IRRemoteControlDevice.send_button") as send, \
             patch("tinytuya.Device.set_retry"), patch("tinytuya.Device.close"):
            result = adapters.send(config, {"action": "set", "values": {"power": False}}, {"power": True, "temperature": 21, "mode": "heat", "fan": "high"})
        send.assert_called_once_with(CODE)
        self.assertEqual(result["status"], "sent")
        self.assertEqual(code_of(config["schema"]["off"]), CODE)


if __name__ == "__main__":
    unittest.main()
