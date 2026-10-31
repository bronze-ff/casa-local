"""Caminhos do Linux nativo: segredos em JSON 0600 e leituras do /proc.  python -m unittest tests.test_linux"""
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest

from backend.importar_segredos_linux import importar


class SecretsImportTest(unittest.TestCase):
    def test_imports_valid_json_as_dpapi_and_refuses_invalid(self):
        source, data = Path(tempfile.mkdtemp()), Path(tempfile.mkdtemp()) / ".data"
        (source / "key-recovery").mkdir()
        (source / "devices.json").write_text(json.dumps({"quarto-luz": {"localKey": "x"}}), encoding="utf-8")
        (source / "key-recovery" / "izy.json").write_bytes(b"\xef\xbb\xbf" + json.dumps({"a": 1}).encode())  # BOM do PowerShell
        (source / "quebrado.json").write_text("{nao", encoding="utf-8")
        done, refused = importar(source, data)
        self.assertEqual(sorted(done), sorted([str(Path("devices.dpapi")), str(Path("key-recovery/izy.dpapi"))]))
        self.assertEqual(refused, ["quebrado.dpapi"])
        self.assertEqual(json.loads((data / "key-recovery" / "izy.dpapi").read_bytes()), {"a": 1})
        self.assertFalse((data / "quebrado.dpapi").exists())
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE((data / "devices.dpapi").stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(data.stat().st_mode), 0o700)


@unittest.skipUnless(sys.platform.startswith("linux"), "só no Linux")
class LinuxReadingsTest(unittest.TestCase):
    def test_dpapi_is_identity_and_proc_readings(self):
        from backend import config, health, homelab
        self.assertEqual(config.dpapi(b'{"a":1}'), b'{"a":1}')
        pc = health.machine()
        self.assertGreater(pc["uptime"], 0)
        self.assertTrue(0 <= pc["memory"]["used"] <= 100 and pc["memory"]["totalGb"] > 0)
        machine = homelab.Machine()
        self.assertIsNone(machine.cpu())  # 1ª leitura é só a referência
        machine.last = (0, 0)
        self.assertTrue(0 <= machine.cpu() <= 100)
        self.assertIsNone(machine.wsl_memory())
        self.assertEqual(machine.disks()[0]["drive"], "/")


if __name__ == "__main__":
    unittest.main()
