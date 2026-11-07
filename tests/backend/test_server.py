import http.client
from email.message import Message
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from backend.app import CasaApp
from backend.config import private_ip
from backend.server import CasaHandler, CasaServer, MAX_BODY, local_hosts
from backend.models import AppError


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        dist = self.root / "dist"
        (dist / "assets").mkdir(parents=True)
        (dist / "index.html").write_text('<html><script src="/assets/app.js"></script></html>', encoding="utf-8")
        (dist / "assets" / "app.js").write_text("console.log('preview')", encoding="utf-8")
        (dist / "sw.js").write_text("self.addEventListener('install',()=>{});", encoding="utf-8")
        (self.root / "secret.txt").write_text("PRIVATE_SENTINEL", encoding="utf-8")
        self.app = CasaApp(data_dir=self.root / "data")
        self.server = CasaServer(("127.0.0.1", 0), self.app, dist)
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()
        self.host = f"localhost:{self.server.server_port}"
        self.token = self.request("GET", "/api/bootstrap")[1]["csrfToken"]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=2)
        self.temporary.cleanup()

    def request(self, method, path, body=None, headers=None, raw=False):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=4)
        request_headers = {"Host": self.host}
        if method == "POST":
            request_headers.update({"Content-Type": "application/json", "X-Casa-Token": self.token})
        request_headers.update(headers or {})
        payload = body if raw else json.dumps(body) if body is not None else None
        connection.request(method, path, body=payload, headers=request_headers)
        response = connection.getresponse()
        contents = response.read()
        media_type = response.getheader("Content-Type", "")
        result = json.loads(contents) if "application/json" in media_type else contents.decode("utf-8")
        status, response_headers = response.status, dict(response.getheaders())
        connection.close()
        return status, result, response_headers

    def test_preview_round_trip_persistence_and_no_hardware(self):
        with patch("backend.adapters.send") as send, patch("backend.adapters.discover") as discover, patch("backend.adapters.read") as read:
            status, result, _ = self.request("POST", "/api/devices/quarto-luz/commands", {"action": "set", "values": {"power": False, "brightness": 42}})
            self.assertEqual(status, 200)
            self.assertEqual(result["command"]["status"], "preview")
            self.assertEqual(result["device"]["state"]["brightness"], 42)
            status, state, _ = self.request("GET", "/api/state")
            self.assertNotIn("csrfToken", state)
            self.assertEqual(state["devices"][0]["state"]["brightness"], 42)
            self.assertEqual(state["recentActions"][0]["status"], "preview")
            self.assertEqual(self.request("POST", "/api/discovery", {})[1]["devices"], [])
            send.assert_not_called()
            discover.assert_not_called()
            read.assert_not_called()
        restored = CasaApp(data_dir=self.root / "data")
        self.assertEqual(restored.devices[0]["state"]["brightness"], 42)
        self.assertEqual(self.request("GET", "/api/status")[1]["configuredCount"], 0)

    def test_tv_and_scenes(self):
        result = self.request("POST", "/api/devices/tv-quarto/commands", {"action": "key", "key": "mute"})
        self.assertTrue(result[1]["device"]["state"]["muted"])
        self.assertTrue(CasaApp(data_dir=self.root / "data").devices[3]["state"]["muted"])
        result = self.request("POST", "/api/scenes/boa-noite/run", {})
        self.assertEqual(result[1]["status"], "preview")
        self.assertEqual(len(result[1]["results"]), 3)
        self.assertFalse(result[1]["state"]["devices"][0]["state"]["power"])

    def test_modes_routes_and_routine_guard(self):
        body = {"name": "Leitura", "icon": "book", "steps": {"quarto-luz": {"power": True, "brightness": 50, "colorHex": "#FFD6A0"}}}
        status, result, _ = self.request("POST", "/api/modes", body)
        self.assertEqual(status, 200)
        mode = next(m for m in result["state"]["scenes"] if m["name"] == "Leitura")
        self.assertEqual(self.request("POST", f"/api/scenes/{mode['id']}/run", {})[1]["status"], "preview")
        routine = {"name": "Ler", "days": [0], "time": "21:00", "action": {"type": "scene", "id": mode["id"]}}
        self.assertEqual(self.request("POST", "/api/routines", routine)[0], 200)
        self.assertEqual(self.request("POST", f"/api/modes/{mode['id']}/remove", {})[0], 409)
        self.assertEqual(self.request("POST", "/api/modes/nao-existe/remove", {})[0], 404)
        self.assertEqual(self.request("POST", "/api/modes", {**body, "steps": {}})[0], 400)

    def test_alert_devices_routes(self):
        rule = self.request("POST", "/api/alert-devices/hello", {"id": "0123456789abcdef", "name": "Notebook", "busy": False})[1]
        self.assertEqual(rule["mode"], "watched")
        self.assertEqual(self.request("POST", "/api/alert-devices/0123456789abcdef", {"mode": "none"})[1]["devices"][0]["mode"], "none")
        self.assertEqual(self.request("GET", "/api/alert-devices")[1]["devices"][0]["name"], "Notebook")
        self.assertEqual(self.request("POST", "/api/alert-devices/0123456789abcdef/remove", {})[1]["devices"], [])
        self.assertEqual(self.request("POST", "/api/alert-devices/hello", {"id": "0123456789abcdef"}, headers={"X-Casa-Token": "errado"})[0], 403)

    def test_unknown_resource_and_commands_rejected(self):
        self.assertEqual(self.request("POST", "/api/devices/mystery/commands", {"action": "set", "values": {"power": True}})[0], 404)
        self.assertEqual(self.request("POST", "/api/scenes/mystery/run", {})[0], 404)
        bad = [
            {"action": "set", "values": {"brightness": 101}},
            {"action": "set", "values": {"brightness": True}},
            {"action": "set", "values": {"power": 1}},
            {"action": "set", "values": {"colorHex": "red"}},
            {"action": "set", "values": {"dp": "1"}},
            {"action": "set", "values": {}},
            {"action": "set", "values": {"power": True}, "ip": "192.168.1.4"},
        ]
        for body in bad:
            with self.subTest(body=body):
                self.assertEqual(self.request("POST", "/api/devices/quarto-luz/commands", body)[0], 400)
        self.assertEqual(self.request("POST", "/api/devices/tv-quarto/commands", {"action": "key", "key": []})[0], 400)
        self.assertEqual(self.request("POST", "/api/devices/ar-quarto/commands", {"action": "set", "values": {"temperature": 31}})[0], 400)

    def test_host_origin_csrf_and_forwarded_address(self):
        body = {"action": "set", "values": {"power": False}}
        self.assertEqual(self.request("GET", "/api/bootstrap", headers={"Host": "evil.example"})[0], 403)
        self.assertEqual(self.request("GET", "/api/bootstrap", headers={"Host": "localhost.evil.example"})[0], 403)
        self.assertEqual(self.request("GET", "/api/bootstrap", headers={"Host": "192.168.50.222", "X-Forwarded-Host": self.host})[0], 403)
        self.assertEqual(self.request("GET", "/api/bootstrap", headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.request("POST", "/api/devices/quarto-luz/commands", body, {"X-Casa-Token": "wrong"})[0], 403)
        self.assertEqual(self.request("POST", "/api/devices/quarto-luz/commands", body, {"Origin": f"http://{self.host}", "Sec-Fetch-Site": "same-origin"})[0], 200)
        self.assertEqual(self.request("POST", "/api/devices/quarto-luz/commands", body, {"Origin": "null"})[0], 403)
        self.assertEqual(self.request("POST", "/api/devices/quarto-luz/commands", body, {"Sec-Fetch-Site": "cross-site"})[0], 403)
        self.assertEqual(self.request("GET", "/api/status", headers={"X-Forwarded-For": "8.8.8.8"})[0], 200)

    def test_body_guards(self):
        route = "/api/devices/quarto-luz/commands"
        self.assertEqual(self.request("POST", route, "x" * (MAX_BODY + 1), raw=True)[0], 413)
        self.assertEqual(self.request("POST", route, "{}", {"Content-Type": "text/plain"}, raw=True)[0], 415)
        for body in ["{", "[]", '{"action":"set","action":"key"}', '{"value":NaN}']:
            with self.subTest(body=body):
                self.assertEqual(self.request("POST", route, body, raw=True)[0], 400)
        self.assertEqual(self.request("POST", route, "{}", {"Transfer-Encoding": "chunked"}, raw=True)[0], 400)

    def test_static_boundary_headers_and_secret_exposure(self):
        status, contents, headers = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn("script-src 'self'", headers["Content-Security-Policy"])
        self.assertNotIn("Access-Control-Allow-Origin", headers)
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(self.request("GET", "/sw.js")[2]["Service-Worker-Allowed"], "/")
        self.assertEqual(self.request("GET", "/assets/app.js")[0], 200)
        for path in ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/%2e%2e/%2e%2e/secret.txt", "/.data/devices.dpapi", "/backend/config.py", "/PRODUCT.md", "/assets/app.js.map", "/assets/%252e%252e/secret.txt", "/assets/%5c..%5csecret.txt", "/.env", "/api/state?secret=1"]:
            with self.subTest(path=path):
                status, contents, _ = self.request("GET", path)
                self.assertEqual(status, 404)
                self.assertNotIn("PRIVATE_SENTINEL", str(contents))
        self.assertNotIn("localKey", json.dumps(self.app.snapshot(True)))
        self.assertNotIn("providerId", json.dumps(self.app.snapshot(True)))

    def test_local_unconfigured_refuses_real_send(self):
        self.server.app = CasaApp("local", data_dir=self.root / "data", config={})
        self.token = self.server.app.csrf_token
        with patch("backend.adapters.send") as send:
            status, result, _ = self.request("POST", "/api/devices/quarto-luz/commands", {"action": "set", "values": {"power": True}})
            self.assertEqual(status, 409)
            self.assertEqual(result["code"], "device_unconfigured")
            send.assert_not_called()
        state = self.request("GET", "/api/state")[1]
        self.assertIsNone(state["devices"][0]["state"]["power"])
        self.assertEqual(state["devices"][0]["confidence"], "unknown")

    def test_symlink_not_served(self):
        link = self.root / "dist" / "assets" / "linked.js"
        try:
            link.symlink_to(self.root / "secret.txt")
        except (OSError, NotImplementedError):
            self.skipTest("Creating symlinks needs Windows Developer Mode or permission")
        self.assertEqual(self.request("GET", "/assets/linked.js")[0], 404)

    def test_symlink_boundary_without_windows_privileges(self):
        original = Path.is_symlink

        def is_link(path):
            return path.name == "app.js" or original(path)

        with patch.object(Path, "is_symlink", is_link):
            self.assertEqual(self.request("GET", "/assets/app.js")[0], 404)


class NetworkTests(unittest.TestCase):
    def test_only_explicit_private_networks(self):
        for ip in ["127.0.0.1", "::1", "192.168.1.5", "10.1.2.3", "172.20.4.5", "100.64.1.2", "100.127.255.255", "fd7a:115c:a1e0::123", "::ffff:192.168.1.5"]:
            self.assertTrue(private_ip(ip), ip)
        for ip in ["8.8.8.8", "100.128.0.1", "172.32.0.1", "169.254.1.1", "0.0.0.0", "2001:4860:4860::8888", "example.com", None]:
            self.assertFalse(private_ip(ip), ip)

    def test_additional_hosts_exact_only(self):
        hosts = local_hosts(["casa.example.ts.net"])
        self.assertIn("casa.example.ts.net", hosts)
        self.assertNotIn("other.example.ts.net", hosts)
        for value in ["*", "*.ts.net", "https://casa.example.ts.net", "casa.example:443", "0.0.0.0"]:
            with self.assertRaises(ValueError):
                local_hosts([value])

    def test_public_peer_rejected_even_with_forwarded_private_ip(self):
        handler = object.__new__(CasaHandler)
        handler.client_address = ("8.8.8.8", 1234)
        handler.headers = Message()
        handler.headers["X-Forwarded-For"] = "192.168.1.3"
        with self.assertRaises(AppError) as result:
            handler.guard()
        self.assertEqual(result.exception.code, "private_network_only")


if __name__ == "__main__":
    unittest.main()
