"""Avisos no celular (ntfy) e chave dos atalhos, sem rede."""
import json
from pathlib import Path
import tempfile
import unittest

from backend.models import AppError
from backend.notify import Notifier, _encode
from backend.shortcuts import Shortcuts


class Headers:
    def __init__(self, values):
        self.values = values

    def get_all(self, name, default=None):
        return self.values.get(name, default)


class NotifyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.dir = Path(self.temporary.name)
        self.home = None
        self.frigate = {}
        self.watched = {"cam2", "cam6"}
        self.notifier = Notifier(self.dir, host=lambda: "pc.exemplo.ts.net", presence=lambda: self.home, clock=lambda: 1_000_000.0,
                                 fetch=lambda path: self.frigate[path.split("?")[0]], watched=lambda: self.watched)

    def tearDown(self):
        self.temporary.cleanup()

    def sent(self):
        items = []
        while not self.notifier.queue.empty():
            items.append(self.notifier.queue.get_nowait())
        return items

    def test_motion_only_watched_with_link_photo_and_away_priority(self):
        event = {"id": "1-a", "camera": "cam2", "start": 999_000.0}
        self.notifier.on_motion(event, {"cam1"}, b"jpg")
        self.assertEqual(self.sent(), [])
        self.notifier.on_motion(event, {"cam2"}, b"jpg")
        topic, title, _message, priority, _tags, click, attach, _name = self.sent()[0]
        self.assertEqual((topic, title, priority, attach), ("casa-cameras", "Movimento · Calçada · portão", 4, b"jpg"))
        self.assertEqual(click, "https://pc.exemplo.ts.net/#cameras:replay:cam2:999000")
        self.home = True
        self.notifier.on_motion(event, {"cam2"}, None)
        self.assertEqual(self.sent()[0][3], 2)  # em casa: sem som
        self.notifier.configure({"cameraScope": "all"})
        self.notifier.on_motion({**event, "camera": "cam9"}, set(), None)
        self.assertEqual(len(self.sent()), 1)

    def test_health_and_lab_transitions(self):
        report = lambda state: {"checks": [{"id": "go2rtc", "label": "Serviço de câmeras", "state": state, "detail": "x"}]}
        self.notifier.check_health(report("ok"))
        self.notifier.check_health(report("fail"))
        self.notifier.check_health(report("fail"))
        self.notifier.check_health(report("ok"))
        self.assertEqual([item[1] for item in self.sent()], ["Falhou: Serviço de câmeras", "Voltou: Serviço de câmeras"])
        lab = lambda state, mode="lab": {"mode": mode, "step": None, "services": [{"id": "jellyfin", "name": "Jellyfin", "purpose": "Filmes", "state": state}],
                                         "stats": {"disks": [{"drive": "C", "freeGb": 30, "totalGb": 446}], "gpu": {"temp": 50.0}}}
        self.notifier.check_lab(lab("running"))
        self.notifier.check_lab(lab("exited", mode="jogo"))  # modo jogo: parar é esperado
        self.notifier.check_lab(lab("running"))
        self.notifier.check_lab(lab("exited"))
        self.assertEqual([item[1] for item in self.sent()], ["Voltou: Jellyfin", "Parou: Jellyfin"])
        hot = lab("exited")
        hot["stats"]["gpu"]["temp"] = 90.0
        hot["stats"]["disks"][0]["freeGb"] = 8
        self.notifier.check_lab(hot)
        self.assertEqual(sorted(item[1] for item in self.sent()), ["Disco C: quase cheio", "Placa de vídeo quente"])

    def test_frigate_waits_for_face_then_notifies_once(self):
        event = {"id": "abc", "label": "person", "camera": "cam6", "start_time": 999_998.0, "has_snapshot": True, "sub_label": None}
        self.frigate = {"/api/events": json.dumps([event]).encode(), "/api/events/abc/snapshot.jpg": b"foto",
                        "/api/config": json.dumps({"cameras": {"cam6": {}, "cam1": {}}}).encode()}
        self.notifier.poll_frigate()
        self.assertEqual(self.sent(), [])  # 2 s: espera o rosto
        event["sub_label"] = ["Filippe", 0.93]
        self.frigate["/api/events"] = json.dumps([event]).encode()
        self.home = True
        self.notifier.poll_frigate(dvr_offset=92)
        items = self.sent()
        self.assertEqual(len(items), 1)
        topic, title, _message, priority, _tags, click, attach, _name = items[0]
        self.assertEqual((topic, title, priority, attach), ("casa-pessoas", "Filippe em Garagem", 1, b"foto"))
        self.assertTrue(click.endswith("cameras:replay:cam6:1000090"))
        self.notifier.poll_frigate()
        self.assertEqual(self.sent(), [])

    def test_frigate_respects_bell_and_kinds_and_replaces_dvr(self):
        events = [{"id": "carro", "label": "car", "camera": "cam6", "start_time": 999_000.0, "has_snapshot": False, "sub_label": None},
                  {"id": "rua", "label": "person", "camera": "cam1", "start_time": 999_000.0, "has_snapshot": False, "sub_label": None},
                  {"id": "gente", "label": "person", "camera": "cam6", "start_time": 999_000.0, "has_snapshot": False, "sub_label": None}]
        self.frigate = {"/api/events": json.dumps(events).encode(), "/api/config": json.dumps({"cameras": {"cam6": {}, "cam1": {}}}).encode()}
        self.notifier.poll_frigate()
        self.assertEqual([item[1] for item in self.sent()], ["Pessoa em Garagem"])  # carro não; cam1 sem sino não
        self.notifier.on_motion({"id": "x", "camera": "cam6", "start": 999_000.0}, {"cam6"}, None)
        self.assertEqual(self.sent(), [], "Frigate vigia a Garagem: o DVR não avisa")
        self.notifier.on_motion({"id": "y", "camera": "cam2", "start": 999_000.0}, {"cam2"}, None)
        self.assertEqual(len(self.sent()), 1, "câmera fora do Frigate: o DVR avisa")
        self.notifier.configure({"frigateKinds": "tudo"})
        self.frigate["/api/events"] = json.dumps([{**events[0], "id": "carro2"}]).encode()
        self.notifier.poll_frigate()
        self.assertEqual([item[1] for item in self.sent()], ["Carro em Garagem"])

    def test_disabled_people_topic_still_tracks_frigate(self):
        self.frigate = {"/api/events": b"[]", "/api/config": json.dumps({"cameras": {"cam6": {}}}).encode()}
        self.notifier._watch(None, None, lambda: 0.0, False)
        self.assertTrue(self.notifier.frigate_ok)
        self.assertEqual(self.notifier.frigate_cameras, {"cam6"})
        self.notifier.configure({"enabled": {"pessoas": False}})
        event = {"id": "abc", "label": "person", "camera": "cam6", "start_time": 999_000.0, "has_snapshot": False, "sub_label": "Ana"}
        self.frigate["/api/events"] = json.dumps([event]).encode()
        self.notifier._watch(None, None, lambda: 0.0, False)
        self.assertEqual(self.sent(), [], "pessoas desligado: não avisa")
        self.assertTrue(self.notifier.frigate_ok)
        motion = {"id": "z", "camera": "cam6", "start": 999_000.0}
        self.notifier.on_motion(motion, {"cam6"}, None)
        self.assertEqual(self.sent(), [], "Frigate no ar: o DVR continua calado nesta câmera")

        def down(_path):
            raise OSError("frigate parado")

        self.notifier.fetch = down
        self.notifier._watch(None, None, lambda: 0.0, False)
        self.assertFalse(self.notifier.frigate_ok)
        self.notifier.on_motion(motion, {"cam6"}, None)
        self.assertEqual(len(self.sent()), 1, "Frigate parou: o DVR volta a avisar")

    def test_disabled_topic_and_config_validation(self):
        self.notifier.configure({"enabled": {"casa": False}})
        self.notifier.on_routine("Cheguei", True, "executada")
        self.assertEqual(self.sent(), [])
        for body in ({}, {"enabled": {"x": True}}, {"enabled": {"casa": "sim"}}, {"cameraScope": "todas"}):
            with self.subTest(body=body), self.assertRaises(AppError):
                self.notifier.configure(body)
        self.assertFalse(Notifier(self.dir).enabled["casa"])

    def test_headers_are_ascii(self):
        self.assertEqual(_encode("abc"), "abc")
        self.assertTrue(_encode("Calçada").startswith("=?UTF-8?B?"))


class LocalServerTests(unittest.TestCase):
    def test_local_mode_builds_with_alert_listeners(self):
        # O modo local liga os avisos ao movimento, à localização e às rotinas: a ordem de criação importa.
        from backend.app import CasaApp
        from backend.server import CasaServer
        with tempfile.TemporaryDirectory() as folder:
            server = CasaServer(("127.0.0.1", 0), CasaApp("local", data_dir=folder, config={}))
            try:
                self.assertEqual((len(server.motion.listeners), len(server.routines.listeners)), (1, 1))
            finally:
                server.server_close()


class ShortcutTests(unittest.TestCase):
    def test_key_only_on_action_routes(self):
        with tempfile.TemporaryDirectory() as folder:
            shortcuts = Shortcuts(folder)
            key = shortcuts.status()["key"]
            good = Headers({"Authorization": [f"Bearer {key}"]})
            self.assertTrue(shortcuts.allows("/api/scenes/cheguei/run", good))
            self.assertTrue(shortcuts.allows("/api/homelab", good))
            self.assertFalse(shortcuts.allows("/api/routines", good))
            self.assertFalse(shortcuts.allows("/api/scenes/cheguei/run", Headers({"Authorization": ["Bearer errada"]})))
            self.assertFalse(shortcuts.allows("/api/scenes/cheguei/run", Headers({})))
            new = shortcuts.rotate()["key"]
            self.assertNotEqual(new, key)
            self.assertEqual(Shortcuts(folder).status()["key"], new)


if __name__ == "__main__":
    unittest.main()
