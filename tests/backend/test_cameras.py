import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import socket
import tempfile
import threading
import time
import unittest

from backend.app import CasaApp
from backend.cameras import CameraBridge
from backend.server import CasaServer

JPEG = b"\xff\xd8\xff\xe0fake-jpeg\xff\xd9"


class FakeGo2rtc(BaseHTTPRequestHandler):
    requested = []

    def log_message(self, *args):
        pass

    def do_GET(self):
        FakeGo2rtc.requested.append(self.path)
        if self.path == "/api":
            body, media = b'{"version":"1.9.14"}', "application/json"
        elif self.path == "/api/frame.jpeg?src=cam1":
            body, media = JPEG, "image/jpeg"
        elif self.path == "/api/ws?src=cam1_hd" and self.headers.get("Upgrade") == "websocket" and "Origin" not in self.headers:
            self.wfile.write(b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\nhello")
            self.wfile.flush()
            echo = self.connection.recv(64)
            self.wfile.write(b"echo:" + echo)
            self.wfile.flush()
            return
        elif self.path == "/api/stream.mjpeg?src=cam1_live":
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.end_headers()
            for _ in range(3):
                self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + JPEG + b"\r\n")
            return
        else:
            body, media = b"not found", "text/plain"
            self.send_response(404)
            self.send_header("Content-Type", media)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(200)
        self.send_header("Content-Type", media)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class CameraTests(unittest.TestCase):
    def setUp(self):
        FakeGo2rtc.requested = []
        self.go2rtc = ThreadingHTTPServer(("127.0.0.1", 0), FakeGo2rtc)
        threading.Thread(target=self.go2rtc.serve_forever, daemon=True).start()
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        (root / "dist").mkdir()
        bridge = CameraBridge(f"http://127.0.0.1:{self.go2rtc.server_port}")
        self.server = CasaServer(("127.0.0.1", 0), CasaApp(data_dir=root / "data"), root / "dist", cameras=bridge)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.go2rtc.shutdown()
        self.go2rtc.server_close()
        self.temporary.cleanup()

    def get(self, path, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        connection.request("GET", path, headers={"Host": f"localhost:{self.server.server_port}", **(headers or {})})
        response = connection.getresponse()
        body = response.read()
        connection.close()
        return response.status, response.getheader("Content-Type", ""), body

    def test_list_reports_availability_without_credentials(self):
        status, media, body = self.get("/api/cameras")
        self.assertEqual(status, 200)
        self.assertIn("application/json", media)
        self.assertIn(b'"available": true', body)
        self.assertIn(b'"cam16"', body)
        self.assertNotIn(b'"cam10"', body)
        self.assertNotIn(b"rtsp", body)

    def test_frame_is_proxied_as_jpeg(self):
        status, media, body = self.get("/api/cameras/cam1/frame.jpg")
        self.assertEqual((status, media, body), (200, "image/jpeg", JPEG))

    def test_live_stream_is_proxied_and_slot_released(self):
        for _ in range(3):
            status, media, body = self.get("/api/cameras/cam1/live.mjpeg")
            self.assertEqual(status, 200)
            self.assertTrue(media.startswith("multipart/x-mixed-replace"))
            self.assertEqual(body.count(JPEG), 3)

    def test_unknown_or_hidden_camera_never_reaches_go2rtc(self):
        for path in ("/api/cameras/cam10/frame.jpg", "/api/cameras/cam99/live.mjpeg", "/api/cameras/cam1/frame.jpg?src=../api/config"):
            status, _, _ = self.get(path)
            self.assertEqual(status, 404)
        self.assertFalse(any("cam10" in p or "cam99" in p or "config" in p for p in FakeGo2rtc.requested))

    def test_go2rtc_down_is_reported(self):
        self.go2rtc.shutdown()
        self.go2rtc.server_close()
        status, _, body = self.get("/api/cameras")
        self.assertEqual(status, 200)
        self.assertIn(b'"available": false', body)
        status, _, body = self.get("/api/cameras/cam1/frame.jpg")
        self.assertEqual(status, 503)

    def test_cross_site_and_foreign_host_blocked(self):
        self.assertEqual(self.get("/api/cameras/cam1/frame.jpg", {"Sec-Fetch-Site": "cross-site"})[0], 403)
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        connection.request("GET", "/api/cameras", headers={"Host": "evil.example"})
        self.assertEqual(connection.getresponse().status, 403)
        connection.close()

    def test_frame_served_from_cache_with_age(self):
        self.get("/api/cameras/cam1/frame.jpg")
        before = FakeGo2rtc.requested.count("/api/frame.jpeg?src=cam1")
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        connection.request("GET", "/api/cameras/cam1/frame.jpg", headers={"Host": f"localhost:{self.server.server_port}"})
        response = connection.getresponse()
        self.assertEqual(response.read(), JPEG)
        self.assertIsNotNone(response.getheader("X-Frame-Age"))
        connection.close()
        self.assertEqual(FakeGo2rtc.requested.count("/api/frame.jpeg?src=cam1"), before)

    def test_background_cache_fills_frames(self):
        self.server.cameras.start()
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and not self.server.cameras.cache.get("cam1", (b"",))[0]:
            time.sleep(0.1)
        self.assertEqual(self.server.cameras.cache["cam1"][0], JPEG)

    def test_websocket_is_relayed_without_origin(self):
        client = socket.create_connection(("127.0.0.1", self.server.server_port), timeout=5)
        client.sendall((f"GET /api/cameras/cam1/ws HTTP/1.1\r\nHost: localhost:{self.server.server_port}\r\nOrigin: http://localhost:{self.server.server_port}\r\n"
                        "Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        received = b""
        while b"hello" not in received:
            received += client.recv(256)
        self.assertTrue(received.startswith(b"HTTP/1.1 101"))
        client.sendall(b"ping")
        echoed = b""
        while b"echo:ping" not in echoed:
            chunk = client.recv(256)
            self.assertTrue(chunk)
            echoed += chunk
        client.close()

    def test_websocket_rejects_bad_key_and_hidden_camera(self):
        for path, key in (("/api/cameras/cam1/ws", "bad"), ("/api/cameras/cam10/ws", "dGhlIHNhbXBsZSBub25jZQ==")):
            status, _, _ = self.get(path, {"Upgrade": "websocket", "Connection": "Upgrade", "Sec-WebSocket-Key": key, "Sec-WebSocket-Version": "13"})
            self.assertIn(status, (400, 404))

    def test_tray_query_only_allowed_on_page(self):
        (Path(self.temporary.name) / "dist" / "index.html").write_text("<html></html>", encoding="utf-8")
        self.assertEqual(self.get("/?tray=1")[0], 200)
        self.assertEqual(self.get("/?tray=2")[0], 404)
        self.assertEqual(self.get("/api/cameras?tray=1")[0], 404)

    def test_bridge_refuses_non_loopback_go2rtc(self):
        for url in ("http://192.168.0.16:1984", "https://127.0.0.1:1984", "http://127.0.0.1:1984/x"):
            with self.assertRaises(ValueError):
                CameraBridge(url)


if __name__ == "__main__":
    unittest.main()
