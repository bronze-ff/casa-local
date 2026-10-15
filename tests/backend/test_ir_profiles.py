"""Synthetic IR data only; imports must stay offline and preserve manual learning."""
from copy import deepcopy
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from backend.adapters import climate_code_key
from backend.import_ir_profiles import convert, extract, merge, schemas
from backend.ir_codes import samsung_candidates
from tinytuya.Contrib.IRRemoteControlDevice import IRRemoteControlDevice as IR

# Casa sintética: os IDs reais ficam só em .data/site.json, fora do Git.
SITE = {
    "lights": {"quarto-luz": {"providerId": "testlampquarto000001", "ip": "192.168.0.101", "protocol": 3.3},
               "banheiro-luz": {"providerId": "testlampbanheiro0001", "ip": "192.168.0.102", "protocol": 3.5}},
    "irHub": {"providerId": "testirhub00000000001", "ip": "192.168.0.103", "protocol": 3.3, "controlType": 2},
    "irRemotes": {"ar-quarto": {"deviceId": "testremotear00000001", "remoteId": 1001, "brand": "Electrolux", "category": 5},
                  "tv-quarto": {"deviceId": "testremotetv00000001", "remoteId": 1002, "brand": "Samsung", "category": 2}},
}
HUB = SITE["irHub"]["providerId"]
TARGETS = {k: (v["deviceId"], v["remoteId"], v["brand"], v["category"]) for k, v in SITE["irRemotes"].items()}
_site_patch = patch("backend.import_ir_profiles.load_site", return_value=SITE)


def setUpModule():
    _site_patch.start()


def tearDownModule():
    _site_patch.stop()


PULSES = [9000, 4500] + [560, 560, 560, 1690] * 16 + [560, 20000]
HEAD, KEY = IR.pulses_to_head_key(PULSES)
RECORD = {"compressPulse": KEY, "frequency": 38000}


def archive():
    profiles = {}
    for logical_id, (device_id, index, brand, _) in TARGETS.items():
        names = ["power", "confirm", "tv/av"] if logical_id == "tv-quarto" else ["power_off", "M0_T24_S0", "M2_S0"]
        profiles[logical_id] = {"deviceId": device_id, "remoteId": index, "brand": brand,
                                "head": HEAD, "keys": {name: convert(HEAD, RECORD) for name in names}}
    return {"format": 1, "hubId": HUB, "profiles": profiles}


def config():
    return {logical_id: {"providerId": HUB, "ip": "192.168.0.103", "localKey": "0123456789abcdef",
                        "protocol": 3.3, "adapter": "ir", "controlType": 2,
                        "schema": samsung_candidates() if logical_id == "tv-quarto" else {}}
            for logical_id in TARGETS}


class IRProfileTests(unittest.TestCase):
    def test_conversion_is_offline_and_preserves_timing(self):
        with patch("socket.socket", side_effect=AssertionError("Import must be offline")):
            converted = convert(HEAD, RECORD)
        pulses = IR.base64_to_pulses(converted["code"])
        self.assertEqual(len(pulses), len(PULSES))
        self.assertTrue(all(abs(a - b) <= 30 for a, b in zip(pulses, PULSES)))

    def test_repeat_prefix_does_not_duplicate_pulses(self):
        once = convert(HEAD, RECORD)
        twice = convert(HEAD, {**RECORD, "compressPulse": "02" + KEY[2:]})
        self.assertEqual(once["code"], twice["code"])
        self.assertEqual(twice["repeatPrefix"], 2)

    def test_unsupported_carrier_and_corrupt_code_are_rejected(self):
        for head, record in ((HEAD, {**RECORD, "frequency": 56000}),
                             ("not-hex", RECORD), (HEAD, {**RECORD, "compressPulse": "00broken"})):
            with self.assertRaises(ValueError):
                convert(head, record)

    def test_auto_has_no_temperature_and_off_is_independent(self):
        schema = schemas(archive())["ar-quarto"]
        self.assertIn("off", schema)
        states = [climate_code_key({"power": True, "temperature": t, "mode": "auto", "fan": "auto"}) for t in (17, 24, 30)]
        self.assertEqual(len({schema[state]["code"] for state in states}), 1)
        self.assertEqual(len(schema), 16)  # 14 auto aliases + cool 24 + off

    def test_merge_replaces_candidates_but_preserves_manual_and_validated(self):
        before = config()
        learned = {"code": convert(HEAD, RECORD)["code"], "origem": "aprendido", "validado": False}
        before["tv-quarto"]["schema"]["power"] = learned
        before["tv-quarto"]["schema"]["ok"]["validado"] = True
        saved = deepcopy(before)
        after = merge(before, archive())
        self.assertEqual(before, saved)
        self.assertEqual(after["tv-quarto"]["schema"]["power"], learned)
        self.assertEqual(after["tv-quarto"]["schema"]["ok"], saved["tv-quarto"]["schema"]["ok"])
        self.assertEqual(after["tv-quarto"]["schema"]["source"]["origem"], "geonav-perfil")
        self.assertEqual(after["tv-quarto"]["schema"]["mute"]["origem"], "samsung-padrao")

    def test_wrong_hub_or_profile_association_is_rejected(self):
        bundle = archive()
        bundle["profiles"]["ar-quarto"]["remoteId"] = 999
        with self.assertRaises(ValueError):
            schemas(bundle)
        before = config()
        before["tv-quarto"]["providerId"] = "other-hub"
        with self.assertRaises(ValueError):
            merge(before, archive())

    def test_sqlite_extraction_excludes_session_data(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "RKStorage"
            with closing(sqlite3.connect(path)) as db:
                db.execute("CREATE TABLE catalystLocalStorage(key TEXT PRIMARY KEY,value TEXT)")
                metadata, profiles = [], {}
                for logical_id, (did, index, brand, category) in TARGETS.items():
                    metadata.append({"devId": did, "gwId": HUB, "remoteId": index, "brandName": brand, "devTypeId": category, "uid": "private-account-marker"})
                    profiles[did] = {"gwId": HUB, "remoteId": index, "remoteCode": HEAD, "codeDataType": 2,
                                     "sendTwoTimes": False, "keyCodes": {"1": {**RECORD, "key": "power_off" if logical_id == "ar-quarto" else "power", "session": "private-session-marker"}}}
                db.executemany("INSERT INTO catalystLocalStorage VALUES (?,?)", [
                    ("remoteSubDevList", json.dumps({HUB: {"ir": {"list": metadata}}})),
                    ("remoteDeviceKeys", json.dumps(profiles)), ("sessionToken", "private-token-marker")])
                db.commit()
            with patch("socket.socket", side_effect=AssertionError("No network")):
                bundle = extract(path)
            self.assertNotIn("private-", json.dumps(bundle))
            self.assertEqual(len(bundle["profiles"]), 2)


if __name__ == "__main__":
    unittest.main()
