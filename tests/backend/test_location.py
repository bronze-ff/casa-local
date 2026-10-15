"""Localização pelo OwnTracks: recepção autenticada, lugares, eventos e acesso só do dono."""
import base64
import http.client
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest

from backend.app import CasaApp
from backend.location import LocationStore, distance
from backend.models import AppError
from backend.server import CasaServer

OWNER = "dono@example.com"
URL = "https://casa-pc.exemplo.ts.net"
HOME = (-23.55, -46.63)
STOP = (-23.553, -46.63)  # ~330 m ao sul


class Clock:
    def __init__(self):
        self.now = 1_800_000_000

    def __call__(self):
        return self.now


def basic(user, password):
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.clock = Clock()
        self.store = LocationStore(self.temporary.name, identity=lambda: (OWNER, URL), clock=self.clock)
        self.phone = self.store.setup("Maria Clara")

    def tearDown(self):
        self.temporary.cleanup()

    def point(self, lat, lon, dt=60, **extra):
        self.clock.now += dt
        return self.store.ingest({"_type": "location", "lat": lat, "lon": lon, "tst": self.clock.now, **extra})

    def test_phone_config_uses_tailnet_url_and_random_password(self):
        otrc = self.phone["otrc"]
        self.assertEqual((otrc["mode"], otrc["url"], otrc["tid"], otrc["cmd"]), (3, URL + "/owntracks", "MC", True))
        self.assertGreaterEqual(len(self.phone["password"]), 20)
        again = LocationStore(self.temporary.name, identity=lambda: (None, None), clock=self.clock)
        self.assertEqual(again.owner, OWNER)  # relido do arquivo DPAPI
        self.assertNotIn(self.phone["password"].encode(), Path(self.temporary.name, "localizacao.dpapi").read_bytes())

    def test_authorize_and_lockout(self):
        self.store.authorize(basic("celular", self.phone["password"]), "127.0.0.1")
        for _ in range(10):
            with self.assertRaises(AppError) as error:
                self.store.authorize(basic("celular", "errada"), "127.0.0.1")
            self.assertEqual(error.exception.status, 401)
        with self.assertRaises(AppError) as error:
            self.store.authorize(basic("celular", self.phone["password"]), "127.0.0.1")
        self.assertEqual(error.exception.status, 429)

    def test_places_send_regions_once_and_track_departure(self):
        self.store.save_place({"name": "Casa", "lat": HOME[0], "lon": HOME[1], "radius": 80})
        self.store.save_place({"name": "Ponto", "lat": STOP[0], "lon": STOP[1], "radius": 40})
        reply = self.point(*HOME, acc=10)
        self.assertEqual(reply[0]["action"], "setWaypoints")
        self.assertEqual([w["desc"] for w in reply[0]["waypoints"]["waypoints"]], ["Casa", "Ponto"])
        self.assertEqual(self.point(*HOME, acc=10), [])
        self.assertEqual(self.store.status()["place"], "casa")
        self.point(-23.5515, -46.63, acc=10)
        status = self.store.status()
        self.assertIsNone(status["place"])
        self.assertEqual((status["leftAt"]["kind"], status["leftAt"]["place"]), ("saiu", "casa"))
        self.assertEqual(status["places"][1]["id"], "ponto")
        self.assertAlmostEqual(status["places"][1]["distance"], round(distance(-23.5515, -46.63, *STOP)), delta=1)
        self.point(*STOP, acc=10)
        self.assertEqual([(e["kind"], e["place"]) for e in self.store.status()["events"]], [("saiu", "casa"), ("chegou", "ponto")])

    def test_app_transition_is_exact_and_deduplicated(self):
        self.store.save_place({"name": "Casa", "lat": HOME[0], "lon": HOME[1], "radius": 80})
        self.point(*HOME)
        exact = self.clock.now + 30
        self.store.ingest({"_type": "transition", "event": "leave", "desc": "Casa", "tst": exact})
        self.point(-23.552, -46.63)
        events = self.store.status()["events"]
        self.assertEqual(len(events), 1)
        self.assertEqual((events[0]["tst"], events[0]["exact"]), (exact, True))

    def test_invalid_points_and_future_timestamps_are_ignored(self):
        self.store.ingest({"_type": "location", "lat": 200, "lon": 0, "tst": self.clock.now})
        self.store.ingest({"_type": "location", "lat": 1, "lon": 1, "tst": self.clock.now + 3600})
        self.store.ingest({"_type": "card", "name": "x"})
        self.assertIsNone(self.store.status()["last"])

    def test_history_expires_after_48h(self):
        self.point(*HOME)
        self.clock.now += 49 * 3600
        self.point(*STOP)
        self.assertEqual(len(self.store.points), 1)

    def test_place_validation(self):
        for bad in ({"name": "", "lat": 0, "lon": 0, "radius": 50}, {"name": "X", "lat": 0, "lon": 0, "radius": 5},
                    {"name": "X", "lat": 91, "lon": 0, "radius": 50}, {"name": "X", "lat": 0, "lon": 0, "radius": 50, "extra": 1}):
            with self.assertRaises(AppError):
                self.store.save_place(bad)


class LocationHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        dist = root / "dist"
        dist.mkdir()
        (dist / "index.html").write_text("<html></html>", encoding="utf-8")
        app = CasaApp(data_dir=root / "data")
        self.location = LocationStore(root / "data", identity=lambda: (OWNER, URL))
        self.server = CasaServer(("127.0.0.1", 0), app, dist, allowed_hosts=["casa-pc.exemplo.ts.net"], location=self.location)
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()
        self.password = self.location.setup("Ela")["password"]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=2)
        self.temporary.cleanup()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=4)
        sent = {"Host": "casa-pc.exemplo.ts.net", **(headers or {})}
        payload = json.dumps(body) if body is not None else None
        if payload is not None:
            sent["Content-Type"] = "application/json"
        connection.request(method, path, body=payload, headers=sent)
        response = connection.getresponse()
        result = json.loads(response.read() or b"null")
        connection.close()
        return response.status, result

    def test_phone_posts_with_password_but_cannot_see_panel(self):
        her = {"Tailscale-User-Login": "ela@example.com"}
        status, reply = self.request("POST", "/owntracks", {"_type": "location", "lat": HOME[0], "lon": HOME[1], "tst": int(time.time())},
                                     {**her, "Authorization": basic("celular", self.password)})
        self.assertEqual((status, reply), (200, []))
        self.assertEqual(self.request("POST", "/owntracks", {"_type": "location"}, {**her, "Authorization": basic("celular", "x")})[0], 401)
        for path in ("/api/location", "/api/state", "/api/cameras", "/"):
            self.assertEqual(self.request("GET", path, headers=her)[0], 403, path)
        self.assertEqual(self.request("GET", "/api/location")[0], 403)  # sem identidade pelo .ts.net

    def test_owner_sees_location(self):
        self.location.ingest({"_type": "location", "lat": HOME[0], "lon": HOME[1], "tst": int(time.time())})
        status, result = self.request("GET", "/api/location", headers={"Tailscale-User-Login": OWNER})
        self.assertEqual(status, 200)
        self.assertEqual(result["last"]["lat"], HOME[0])
        self.assertNotIn("password", json.dumps(result))
