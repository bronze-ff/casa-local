import base64
from copy import deepcopy
import os
from pathlib import Path
import tempfile
import threading
import time
import socket
import unittest
from unittest.mock import patch

from backend import adapters
from backend.app import CasaApp
from backend.config import dpapi, load_config, save_config, validate_config
from backend.models import AppError


def lamp_config():
    # Deliberately synthetic test values; never a real device key or schema.
    return {"providerId": "test_device_not_real", "ip": "192.168.200.200", "localKey": "TEST_ONLY_000000", "protocol": 3.3, "adapter": "dp", "schema": {"power": {"dp": "101", "encoding": "bool"}, "brightness": {"dp": "102", "encoding": "integer", "min": 10, "max": 1000}}}


class ConfigurationTests(unittest.TestCase):
    def test_schema_and_private_ip_required(self):
        config = lamp_config()
        self.assertEqual(validate_config({"quarto-luz": config}), {"quarto-luz": config})
        for address in ["8.8.8.8", "example.com", "127.0.0.1", "169.254.4.2"]:
            config["ip"] = address
            with self.assertRaises(AppError):
                validate_config({"quarto-luz": config})
        config = lamp_config()
        config["schema"]["brightness"].pop("min")
        with self.assertRaises(AppError):
            validate_config({"quarto-luz": config})
        config = lamp_config()
        config["schema"]["power"].pop("dp")
        with self.assertRaises(AppError):
            validate_config({"quarto-luz": config})

    @unittest.skipUnless(os.name == "nt", "Windows DPAPI integration")
    def test_dpapi_roundtrip_never_plaintext(self):
        with tempfile.TemporaryDirectory() as directory:
            config = {"quarto-luz": lamp_config()}
            save_config(config, directory)
            raw = (Path(directory) / "devices.dpapi").read_bytes()
            self.assertNotIn(b"TEST_ONLY_000000", raw)
            self.assertEqual(load_config(directory), config)
            self.assertNotIn("localKey", str(CasaApp("local", config=config).snapshot()))

    def test_secure_storage_fails_closed_without_windows(self):
        with patch("backend.config.os.name", "posix"):
            with self.assertRaises(AppError):
                dpapi(b"test")

    def test_climate_ir_requires_canonical_full_state(self):
        code = base64.b64encode(b"\x01\x02\x03\x04").decode()
        state = {"power": True, "temperature": 24, "mode": "cool", "fan": "auto"}
        config = lamp_config()
        config.update(adapter="ir", controlType=1, schema={adapters.climate_code_key(state): code})
        validate_config({"ar-quarto": config})
        config["schema"] = {"power": code}
        with self.assertRaises(AppError):
            validate_config({"ar-quarto": config})


class AdapterTests(unittest.TestCase):
    def test_numeric_mapping_is_explicit(self):
        spec = {"encoding": "integer", "min": 10, "max": 1000}
        self.assertEqual(adapters.encode_dp("brightness", 0, spec), 10)
        self.assertEqual(adapters.encode_dp("brightness", 100, spec), 1000)
        self.assertEqual(adapters.decode_dp("brightness", 505, spec), 50)

    def test_rgb_and_hsv_round_trip(self):
        for encoding in ["rgbhex", "hsvhex"]:
            spec = {"encoding": encoding}
            encoded = adapters.encode_dp("colorHex", "#FF0000", spec)
            self.assertEqual(adapters.decode_dp("colorHex", encoded, spec), "#FF0000")

    def test_ack_does_not_confirm_physical_state(self):
        try:
            import tinytuya
        except ImportError:
            self.skipTest("Install requirements.txt to test TinyTuya adapter")
        with patch.object(tinytuya.Device, "set_multiple_values", return_value={}), patch.object(tinytuya.Device, "status", return_value={"Error": "TEST_ONLY"}), patch.object(tinytuya.Device, "close"):
            result = adapters.send(lamp_config(), {"action": "set", "values": {"power": True}}, {"power": None})
        self.assertEqual(result["status"], "acknowledged")
        self.assertEqual(result["confidence"], "unknown")
        self.assertEqual(result["state"], {})

    def test_reported_dp_is_only_physical_state(self):
        try:
            import tinytuya
        except ImportError:
            self.skipTest("Install requirements.txt to test TinyTuya adapter")
        with patch.object(tinytuya.Device, "set_multiple_values", return_value={}), patch.object(tinytuya.Device, "status", return_value={"dps": {"101": False, "102": 505}}), patch.object(tinytuya.Device, "close"):
            result = adapters.send(lamp_config(), {"action": "set", "values": {"power": True}}, {"power": None})
        self.assertEqual(result["state"], {"power": False, "brightness": 50})
        self.assertEqual(result["confidence"], "reported")

    def test_ir_failure_sends_once_no_false_ack(self):
        try:
            from tinytuya.Contrib.IRRemoteControlDevice import IRRemoteControlDevice
        except ImportError:
            self.skipTest("Install requirements.txt to test TinyTuya adapter")
        config = lamp_config()
        config.update(adapter="ir", controlType=1, schema={"power": base64.b64encode(b"\x01\x02\x03\x04").decode()})
        with patch.object(IRRemoteControlDevice, "set_value", return_value={"Error": "not reachable"}) as call, patch.object(IRRemoteControlDevice, "close"):
            with self.assertRaises(AppError):
                adapters.send(config, {"action": "key", "key": "power"}, {"power": None})
            self.assertEqual(call.call_count, 1)

    def test_ir_success_never_claims_tv_physical_power(self):
        try:
            from tinytuya.Contrib.IRRemoteControlDevice import IRRemoteControlDevice
        except ImportError:
            self.skipTest("Install requirements.txt to test TinyTuya adapter")
        config = lamp_config()
        config.update(adapter="ir", controlType=1, schema={"power": base64.b64encode(b"\x01\x02\x03\x04").decode()})
        with patch.object(IRRemoteControlDevice, "set_value", return_value=None) as call, patch.object(IRRemoteControlDevice, "close"):
            result = adapters.send(config, {"action": "key", "key": "power"}, {"power": None})
            self.assertEqual(call.call_count, 1)
        self.assertEqual(result["status"], "sent")
        self.assertEqual(result["confidence"], "unknown")
        self.assertEqual(result["state"], {})

    def test_ir_socket_failure_never_resends_power_toggle(self):
        try:
            import tinytuya
        except ImportError:
            self.skipTest("Install requirements.txt to test TinyTuya adapter")
        config = lamp_config()
        config.update(adapter="ir", controlType=1, schema={"power": base64.b64encode(b"\x01\x02\x03\x04").decode()})

        class FailedSocket:
            sends, connects = 0, 0

            def setsockopt(self, *args):
                pass

            def settimeout(self, *args):
                pass

            def connect(self, *args):
                self.connects += 1

            def sendall(self, *args):
                self.sends += 1
                raise socket.timeout("synthetic timeout after an ambiguous send")

            def close(self):
                pass

        fake = FailedSocket()
        with patch("socket.socket", return_value=fake):
            with self.assertRaises(AppError):
                adapters.send(config, {"action": "key", "key": "power"}, {"power": None})
        self.assertEqual(fake.connects, 1)
        self.assertEqual(fake.sends, 1)

    def test_physical_device_commands_are_serialized(self):
        config = lamp_config()
        app = CasaApp("local", config={"quarto-luz": config, "banheiro-luz": deepcopy(config)})
        active, max_active = 0, 0
        lock = threading.Lock()

        def sender(*args):
            nonlocal active, max_active
            with lock:
                active += 1
                max_active = max(max_active, active)
            time.sleep(0.03)
            with lock:
                active -= 1
            return {"state": {}, "confidence": "unknown", "status": "acknowledged", "message": "test"}

        threads = [threading.Thread(target=app.command, args=(device, {"action": "set", "values": {"power": True}})) for device in ["quarto-luz", "banheiro-luz"]]
        with patch("backend.adapters.send", side_effect=sender):
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
        self.assertEqual(max_active, 1)

    def test_scene_partial_failure_does_not_retry_or_toggle_tv(self):
        app = CasaApp("local", config={"quarto-luz": lamp_config()})
        with patch("backend.adapters.send", return_value={"state": {}, "confidence": "unknown", "status": "acknowledged", "message": "test"}) as send:
            result = app.scene("boa-noite")
        self.assertEqual(result["status"], "partial")
        self.assertEqual(send.call_count, 1)
        self.assertNotIn("tv-quarto", [r["deviceId"] for r in result["results"]])


if __name__ == "__main__":
    unittest.main()
