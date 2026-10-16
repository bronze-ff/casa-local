"""Replay das gravações do DVR via go2rtc, sem rede (chamadas ao go2rtc simuladas)."""
from datetime import datetime
import unittest
from urllib.parse import parse_qs, urlsplit

from backend.models import AppError
from backend.replay import MAX_ACTIVE, Replays


class FakeCameras:
    host, port = "127.0.0.1", 1984


class Clock:
    def __init__(self):
        self.now = datetime(2026, 10, 16, 12, 30, 0).timestamp()

    def __call__(self):
        return self.now


class ReplayTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.calls = []
        self.replays = Replays(FakeCameras(), source=lambda: ("192.0.2.9", "admin", "s3nh@!"), clock=self.clock)
        self.replays._go2rtc = lambda method, query: self.calls.append((method, query)) or 200

    def test_builds_dvr_playback_url_and_registers_stream(self):
        start = datetime(2026, 10, 16, 12, 21, 0).timestamp()
        result = self.replays.open("cam2", {"start": start})
        method, query = self.calls[-1]
        self.assertEqual((method, query["name"]), ("PUT", f"replay_{result['id']}"))
        url = urlsplit(query["src"])
        params = parse_qs(url.query)
        self.assertEqual((url.scheme, url.hostname, url.port, url.path), ("rtsp", "192.0.2.9", 554, "/cam/playback"))
        self.assertEqual(url.password, "s3nh%40%21")  # senha escapada, nunca devolvida ao painel
        self.assertEqual((params["channel"], params["starttime"], params["endtime"]), (["2"], ["2026_10_16_12_21_00"], ["2026_10_16_12_30_00"]))
        self.assertNotIn("s3nh", str(result))
        self.assertEqual(self.replays.stream(result["id"]), f"replay_{result['id']}")

    def test_rejects_future_old_unknown_and_bad_bodies(self):
        for camera, body in (("cam2", {"start": self.clock.now}), ("cam2", {"start": self.clock.now - 31 * 86400}),
                             ("cam10", {"start": self.clock.now - 60}), ("cam2", {}), ("cam2", {"start": "x"}),
                             ("cam2", {"start": self.clock.now - 60, "replace": "../x"})):
            with self.assertRaises(AppError):
                self.replays.open(camera, body)
        with self.assertRaises(AppError):
            self.replays.stream("deadbeef0000")

    def test_replace_limit_close_and_expiry(self):
        first = self.replays.open("cam1", {"start": self.clock.now - 600})["id"]
        second = self.replays.open("cam1", {"start": self.clock.now - 570, "replace": first})["id"]
        self.assertIn(("DELETE", {"src": f"replay_{first}"}), self.calls)
        with self.assertRaises(AppError):
            self.replays.stream(first)
        ids = [second] + [self.replays.open("cam3", {"start": self.clock.now - 300})["id"] for _ in range(MAX_ACTIVE)]
        self.assertEqual(len(self.replays.active), MAX_ACTIVE)
        self.assertNotIn(ids[0], self.replays.active)  # o mais antigo saiu
        self.replays.close(ids[-1])
        self.assertNotIn(ids[-1], self.replays.active)
        self.clock.now += 16 * 60  # ainda na folga da conexão (janela + 60 s): nada some
        recent = self.replays.open("cam4", {"start": self.clock.now - 60})["id"]
        self.assertIn(ids[1], self.replays.active)
        self.clock.now += 2 * 60  # passou da janela + folga: o antigo expira, o recente fica
        self.replays.open("cam4", {"start": self.clock.now - 60})
        self.assertNotIn(ids[1], self.replays.active)
        self.assertIn(recent, self.replays.active)


if __name__ == "__main__":
    unittest.main()
