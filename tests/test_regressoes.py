"""Regressões com serviços falsos, sem rede nem aparelhos."""
from contextlib import ExitStack
import http.client
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import urllib.error

from backend import cameras, notify, provision, routines, server
from backend.models import AppError


class CapturedThread:
    def __init__(self, target, **kwargs):
        self.target = target

    def start(self):
        pass


class RegressoesTest(unittest.TestCase):
    def test_previa_bloqueia_rotas_fisicas(self):
        paths = ["/api/cameras", "/api/cameras/cam1/frame.jpg", "/api/cameras/cam1/ws",
                 "/api/cameras/cam1/live.mjpeg", "/api/cameras/cam1/replay",
                 "/api/replays/abcdef123456/ws", "/api/replays/abcdef123456/close"]
        for path in paths:
            with self.subTest(path=path):
                handler = object.__new__(server.CasaHandler)
                handler.server = SimpleNamespace(app=SimpleNamespace(mode="preview"))
                handler.path, handler.command = path, "GET"
                handler.guard = Mock()
                handler.drain_body = Mock()
                handler.json_response = Mock()
                handler.dispatch(path.endswith(("/replay", "/close")))
                status, body = handler.json_response.call_args.args
                self.assertEqual((status, body.get("code")), (409, "preview_mode"))

    def test_previa_nao_inicia_cameras(self):
        bridge = cameras.CameraBridge(preview=True)
        with patch.object(cameras.threading, "Thread", side_effect=AssertionError("worker físico")), \
                patch.object(bridge, "_open", side_effect=AssertionError("acesso físico")):
            bridge.start()
            self.assertFalse(bridge.available())
            for operation in (lambda: bridge.frame("cam1"), lambda: bridge.open_live("cam1"),
                              lambda: bridge.open_ws("cam1", "a" * 22 + "==")):
                with self.assertRaises(AppError) as raised:
                    operation()
                self.assertEqual(raised.exception.code, "preview_mode")
        fake = SimpleNamespace(app=SimpleNamespace(mode="preview"), cameras=Mock())
        server.CasaServer.start_background(fake)
        fake.cameras.start.assert_not_called()

    def test_servidor_cria_bridge_em_previa(self):
        with tempfile.TemporaryDirectory() as folder, ExitStack() as stack:
            for name in ("LocationStore", "Routines", "AlertDevices", "Homelab", "Shortcuts",
                         "Notifier", "AcUsage", "MotionWatcher", "SamsungTVs", "Replays", "Backups", "Network"):
                stack.enter_context(patch.object(server, name))
            stack.enter_context(patch.object(server, "local_hosts", return_value={"localhost"}))
            stack.enter_context(patch.object(server.ThreadingHTTPServer, "__init__", return_value=None))
            app = SimpleNamespace(mode="preview", data_dir=Path(folder), start_polling=Mock())
            panel = server.CasaServer(("127.0.0.1", 0), app)
            with patch.object(panel.cameras, "_open", side_effect=AssertionError("acesso físico")):
                self.assertFalse(panel.cameras.available())

    def test_reprovisionamento_preserva_calibracao_da_mesma_identidade(self):
        hub = {"providerId": "hub-falso", "controlType": 2, "ip": "192.0.2.1", "protocol": 3.3}
        calibration = {"fix": [[0, 1, 0]], "turbo": [0, 2]}
        original = {"ar-quarto": {**hub, "adapter": "ir", "schema": {"off": "AAAA"}, "frameFix": calibration}}
        with patch.object(provision, "_bundle", return_value={"hub-falso": "chave-falsa"}), \
                patch.object(provision, "samsung_candidates", return_value={}):
            rebuilt = provision.build(original, {"lights": {}, "irHub": {**hub, "ip": "192.0.2.2"}})
            self.assertEqual(rebuilt["ar-quarto"].get("frameFix"), calibration)
            self.assertEqual(rebuilt["ar-quarto"]["schema"], {"off": "AAAA"})
            for changed in ({"providerId": "outro-hub"}, {"controlType": 1}):
                other = {**hub, **changed}
                with patch.object(provision, "_bundle", return_value={other["providerId"]: "outra-chave"}):
                    rebuilt = provision.build(original, {"lights": {}, "irHub": other})
                self.assertNotIn("frameFix", rebuilt["ar-quarto"])

    def test_dvr_sempre_avisa_movimento_das_cameras_com_sino(self):
        event = {"camera": "cam1", "start": 900}
        with tempfile.TemporaryDirectory() as folder:
            notifier = notify.Notifier(folder)
            notifier.on_motion(event, {"cam1"})
            self.assertEqual(notifier.queue.get_nowait()[0], "casa-cameras")
            notifier.on_motion(event, set())  # câmera sem sino
            self.assertTrue(notifier.queue.empty())
            notifier.configure({"cameraScope": "all"})
            notifier.on_motion(event, set())
            self.assertEqual(notifier.queue.get_nowait()[0], "casa-cameras")
            for stale in ({"enabled": {"pessoas": True}}, {"frigateKinds": "tudo"}):
                with self.assertRaises(AppError):
                    notifier.configure(stale)

    def test_worker_camera_sobrevive_a_erros_de_transporte(self):
        for error in (OSError("rede"), TimeoutError("tempo"), urllib.error.URLError("rede"),
                      http.client.IncompleteRead(b"jpeg")):
            with self.subTest(error=type(error).__name__):
                bridge = cameras.CameraBridge()
                bridge._store("cam1", b"antigo")
                fetched = []
                def fetch(camera_id):
                    fetched.append(camera_id)
                    if len(fetched) == 1:
                        raise error
                    bridge.close()
                    return b"novo"
                bridge._fetch = fetch
                bridge._next_due = lambda: "cam1"
                def wait(seconds):
                    self.assertEqual(bridge.recent("cam1")[0], b"")
                    return False
                with patch.object(cameras.threading, "Thread", CapturedThread), \
                        patch.object(cameras, "CACHE_WORKERS", 1), patch.object(bridge.stop_event, "wait", side_effect=wait):
                    bridge.start()
                    bridge.workers[0].target()
                self.assertEqual(fetched, ["cam1", "cam1"])
                self.assertEqual(bridge.recent("cam1")[0], b"novo")
                self.assertFalse(bridge.in_flight)

    def test_agendador_isola_acao_e_iteracao_com_erro(self):
        with tempfile.TemporaryDirectory() as folder:
            app = SimpleNamespace(scene=Mock(side_effect=[RuntimeError("ação falhou"), {}]))
            scheduler = routines.Routines(app, folder, clock=lambda: 1000)
            action = {"type": "scene", "id": "teste"}
            scheduler.due = Mock(side_effect=[OSError("disco falhou"),
                                             [("falha", action, None), ("boa", action, None)], []])
            waits = []
            def wait(seconds):
                waits.append(seconds)
                if len(waits) == 3:
                    scheduler.close()
            with patch.object(routines.threading, "Thread", CapturedThread), \
                    patch.object(scheduler.wake, "wait", side_effect=wait):
                scheduler.start()
                scheduler.thread.target()
            self.assertEqual([item["ok"] for item in scheduler.log], [False, True])
            self.assertEqual(scheduler.last_error, "ação falhou")
            self.assertEqual(scheduler.last_error_at, 1000)
            self.assertEqual(scheduler.status()["lastError"], "ação falhou")
            self.assertEqual(scheduler.status()["lastErrorAt"], 1000)
            self.assertEqual(len(waits), 3)

    def test_agendador_continua_apos_falha_ao_salvar_execucao(self):
        with tempfile.TemporaryDirectory() as folder:
            scheduler = routines.Routines(SimpleNamespace(scene=lambda name: {}), folder, clock=lambda: 1000)
            action = {"type": "scene", "id": "teste"}
            scheduler.due = Mock(return_value=[("primeira", action, None), ("segunda", action, None)])
            save = scheduler._save
            attempts = []
            def save_once():
                attempts.append(True)
                if len(attempts) == 1:
                    raise OSError("gravação falhou")
                save()
            with patch.object(routines.threading, "Thread", CapturedThread), \
                    patch.object(scheduler, "_save", side_effect=save_once), \
                    patch.object(scheduler.wake, "wait", side_effect=lambda seconds: scheduler.close()):
                scheduler.start()
                scheduler.thread.target()
            self.assertEqual([item["name"] for item in scheduler.log], ["primeira", "segunda"])
            self.assertEqual(scheduler.last_error, "gravação falhou")
            self.assertEqual(scheduler.last_error_at, 1000)
            self.assertEqual(len(attempts), 2)


if __name__ == "__main__":
    unittest.main()
