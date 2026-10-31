"""HTTP command boundary tests: in-memory streams, no listener or devices."""
from collections import defaultdict, deque
from email.message import Message
from io import BytesIO
import json
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from backend import server
from backend.models import AppError


class BoundaryTests(unittest.TestCase):
    def setUp(self):
        network = patch('socket.socket', side_effect=AssertionError('network disabled'))
        network.start()
        self.addCleanup(network.stop)
        self.app = SimpleNamespace(mode='local', csrf_token='valid', command_budget=2.5,
                                   command=Mock(return_value={'state': {}, 'device': {}, 'command': {}}),
                                   scene=Mock(return_value={'status': 'completed'}))
        self.panel = SimpleNamespace(app=self.app, allowed_hosts={'localhost'},
                                     location=SimpleNamespace(owner=None),
                                     shortcuts=SimpleNamespace(allows=Mock(return_value=False)),
                                     rate_lock=threading.Lock(), rates=defaultdict(deque))

    def request(self, path='/api/devices/quarto-luz/commands', body=b'{}', headers=None):
        handler = object.__new__(server.CasaHandler)
        handler.server = self.panel
        handler.client_address = ('127.0.0.1', 1234)
        handler.command, handler.path, handler.request_version = 'POST', path, 'HTTP/1.0'
        handler.requestline = 'POST ' + path + ' HTTP/1.0'
        handler.headers = Message()
        values = {'Host': 'localhost', 'X-Casa-Token': 'valid',
                  'Content-Type': 'application/json', 'Content-Length': str(len(body))}
        values.update(headers or {})
        for key, value in values.items():
            if value is not None:
                handler.headers[key] = value
        handler.rfile, handler.wfile = BytesIO(body), BytesIO()
        handler.dispatch(True)
        raw = handler.wfile.getvalue()
        head, payload = raw.split(b'\r\n\r\n', 1)
        lines = head.decode().split('\r\n')
        response_headers = dict(line.split(': ', 1) for line in lines[1:])
        return int(lines[0].split()[1]), response_headers, json.loads(payload)

    def test_context_uses_configured_budget_and_request_id(self):
        status, headers, _ = self.request()
        self.assertEqual(status, 200)
        context = self.app.command.call_args.kwargs['context']
        self.assertEqual(headers['X-Request-Id'], context.request_id)
        self.assertAlmostEqual(context.deadline - context._started_at, 2.5)

    def test_error_receipt_preserved_and_request_id_matches(self):
        def fail(device, body, *, context):
            receipt = {'requestId': context.request_id, 'outcome': 'diverged',
                       'delivery': 'sent', 'reported': {'power': False},
                       'divergedFields': ['power'], 'timing': {'overrunMs': 500}}
            raise AppError('incerto', 502, 'command_result_unknown', receipt=receipt)
        self.app.command.side_effect = fail
        status, headers, data = self.request()
        self.assertEqual((status, data['code']), (502, 'command_result_unknown'))
        self.assertEqual(data['receipt']['requestId'], headers['X-Request-Id'])
        self.assertEqual(data['receipt']['reported'], {'power': False})
        self.assertEqual(data['receipt']['divergedFields'], ['power'])
        self.assertEqual(data['receipt']['timing'], {'overrunMs': 500})

    def test_invalid_token_is_rejected_before_effect(self):
        status, _, data = self.request(headers={'X-Casa-Token': 'wrong'})
        self.assertEqual((status, data['code']), (403, 'invalid_token'))
        self.app.command.assert_not_called()
        status, _, _ = self.request()
        self.assertEqual(status, 200)
        self.assertEqual(self.app.command.call_count, 1)

    def test_deadline_and_parsing_keep_codes_and_request_id(self):
        self.app.command.side_effect = AppError('Prazo encerrado; nenhum comando enviado', 504,
                                                'command_deadline_exceeded',
                                                receipt={'delivery': 'not_sent', 'outcome': 'unconfirmed'})
        status, headers, data = self.request()
        self.assertEqual((status, data['code'], data['receipt']['delivery']),
                         (504, 'command_deadline_exceeded', 'not_sent'))
        self.assertTrue(headers['X-Request-Id'])
        self.app.command.reset_mock()
        status, headers, data = self.request(body=b'{')
        self.assertEqual((status, data['code']), (400, 'invalid_request'))
        self.assertTrue(headers['X-Request-Id'])
        self.app.command.assert_not_called()
        status, _, data = self.request(headers={'Content-Type': 'text/plain'})
        self.assertEqual((status, data['code']), (415, 'unsupported_media'))
        status, _, data = self.request(headers={'Content-Length': None})
        self.assertEqual((status, data['code']), (411, 'length_required'))

    def test_guards_are_legacy_403_before_effect(self):
        for headers, code in [({'Host': 'outside.example'}, 'invalid_host'),
                              ({'Origin': 'http://outside.example'}, 'invalid_origin'),
                              ({'Sec-Fetch-Site': 'cross-site'}, 'cross_site')]:
            with self.subTest(code=code):
                status, _, data = self.request(headers=headers)
                self.assertEqual((status, data['code']), (403, code))
        self.app.command.assert_not_called()

    def test_each_command_gets_fresh_server_id(self):
        _, first, _ = self.request()
        _, second, _ = self.request()
        self.assertNotEqual(first['X-Request-Id'], second['X-Request-Id'])

    def test_scene_and_shortcut_keep_legacy_dispatch(self):
        status, _, data = self.request('/api/scenes/noite/run')
        self.assertEqual((status, data['status']), (200, 'completed'))
        self.app.scene.assert_called_once_with('noite')
        self.panel.shortcuts.allows.return_value = True
        status, _, _ = self.request(headers={'X-Casa-Token': None})
        self.assertEqual(status, 200)
        self.app.command.assert_called_once()

    def test_saturation_returns_503_without_dispatch(self):
        connection = Mock()
        slots = Mock()
        slots.acquire.return_value = False
        fake_server = SimpleNamespace(slots=slots)
        with patch.object(server.ThreadingHTTPServer, 'process_request') as dispatch:
            server.CasaServer.process_request(fake_server, connection, ('127.0.0.1', 1))
        response = connection.sendall.call_args.args[0]
        head, payload = response.split(b'\r\n\r\n', 1)
        self.assertIn(b' 503 ', head)
        self.assertIn(b'Retry-After:', head)
        self.assertNotIn(b'X-Request-Id:', head)
        self.assertEqual(json.loads(payload)['code'], 'server_busy')
        dispatch.assert_not_called()
        connection.close.assert_called_once()
