"""Command contract: fake clocks/SDK only, all physical sockets forbidden."""
from copy import deepcopy
from dataclasses import FrozenInstanceError
from pathlib import Path
import socket
import sys
import threading
import tempfile
import json
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

from backend import models
with patch.object(Path, 'chmod'), patch('os.umask'):
    from backend import adapters, app as application, routines, tuya_light
try:
    import tinytuya as installed_sdk
except ImportError:
    installed_sdk = None


class Clock:
    def __init__(self):
        self.value = 0.0

    def __call__(self):
        return self.value


class SDK:
    """Only device I/O is replaced; production encode, receipt and app execute."""
    def __init__(self):
        self.reads = []
        self.ack = {}
        self.calls = []
        self.instances = []
        self.on_set = None

    def module(self):
        sdk = self
        class Device:
            def __init__(self, *args, **kwargs):
                self.send_result = None
                self.closed = False
                self.timeouts = []
                sdk.instances.append(self)

            def set_retry(self, value):
                if value:
                    raise AssertionError('retry enabled')

            def set_socketTimeout(self, value):
                if value <= 0:
                    raise AssertionError('nonpositive timeout')
                self.timeouts.append(value)

            def status(self):
                sdk.calls.append('read')
                if not sdk.reads:
                    raise AssertionError('unexpected physical read')
                value = sdk.reads.pop(0)
                if callable(value):
                    value = value()
                if isinstance(value, Exception):
                    raise value
                return deepcopy(value)

            def generate_payload(self, command, values):
                return SimpleNamespace(cmd=command, values=values)

            def _send_receive(self, payload, getresponse=True):
                sdk.calls.append(('set', deepcopy(payload.values)))
                if sdk.on_set:
                    sdk.on_set()
                if isinstance(sdk.ack, Exception):
                    raise sdk.ack
                return deepcopy(sdk.ack)

            def set_multiple_values(self, payload, nowait=False):
                return self._send_receive(self.generate_payload(7, payload), getresponse=not nowait)

            def set_value(self, *args, **kwargs):
                return self.set_multiple_values({'ir': True}, **kwargs)

            def send_button(self, code):
                self.set_multiple_values({'ir': True}, nowait=True)

            def close(self):
                self.closed = True

        module = ModuleType('tinytuya')
        module.CONTROL = 7
        module.Device = Device
        ir = ModuleType('tinytuya.Contrib.IRRemoteControlDevice')
        ir.IRRemoteControlDevice = Device
        return {'tinytuya': module, 'tinytuya.Contrib': ModuleType('tinytuya.Contrib'),
                'tinytuya.Contrib.IRRemoteControlDevice': ir}


def light(provider='fake-light-a'):
    return {'providerId': provider, 'ip': '10.0.0.1', 'localKey': '0' * 16,
            'protocol': 3.5, 'adapter': 'light', 'schema': dict(tuya_light.DEFAULT_SCHEMA)}


def infrared():
    return {'providerId': 'fake-hub-a', 'ip': '10.0.0.2', 'localKey': '0' * 16,
            'protocol': 3.3, 'adapter': 'ir', 'controlType': 2,
            'schema': {'off': 'AAA=', 'power': 'AAA='}}


class OfflineCase(unittest.TestCase):
    def setUp(self):
        self.clock, self.sdk = Clock(), SDK()
        for guard in (patch.object(socket, 'socket', side_effect=AssertionError('physical socket forbidden')),
                      patch.object(socket, 'create_connection', side_effect=AssertionError('physical socket forbidden')),
                      patch.object(models.time, 'monotonic', self.clock),
                      patch.dict(sys.modules, self.sdk.module())):
            guard.start()
            self.addCleanup(guard.stop)
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name)

    def make_app(self, config=None, **kwargs):
        return application.CasaApp('local', self.directory,
                                   {'quarto-luz': light()} if config is None else config, **kwargs)

    def send(self, values=None, config=None, command=None):
        return adapters.send(config or light(), command or {'action': 'set', 'values': values or {'power': True}},
                             {}, context=models.command_context())

    def writes(self):
        return [call for call in self.sdk.calls if isinstance(call, tuple)]


class AdapterContractTest(OfflineCase):
    @unittest.skipIf(installed_sdk is None, 'run with project .venv to exercise installed TinyTuya')
    def test_installed_sdk_multi_dp_error_has_no_fallback_emission(self):
        dp = {**light(), 'adapter': 'dp', 'protocol': 3.3, 'schema': {
            'power': {'dp': '1', 'encoding': 'bool'},
            'brightness': {'dp': '2', 'encoding': 'integer', 'min': 10, 'max': 1000}}}
        cases = (({**light(), 'protocol': 3.3}, {'20': True, '22': 500}, 7, 1),
                 ({**light(), 'protocol': 3.5}, {'20': True, '22': 500}, 13, 1),
                 (dp, {'1': True, '2': 505}, 7, 0))
        for config, expected, control, prereads in cases:
            with self.subTest(adapter=config['adapter'], protocol=config['protocol']):
                emissions = []
                closed = set()
                def exchange(device, payload, *args, **kwargs):
                    body = json.loads(payload.payload)
                    emissions.append((payload.cmd, body.get('dps', body.get('data', {}).get('dps')),
                                      kwargs.get('getresponse')))
                    return {'Error': 'synthetic timeout after emission', 'Err': '902'} if len(emissions) == 1 else {}
                with patch.dict(sys.modules, {'tinytuya': installed_sdk}), \
                        patch.object(installed_sdk.Device, '_send_receive', exchange), \
                        patch.object(installed_sdk.Device, 'status', return_value={
                            'dps': {'20': True, '21': 'white', '22': 500}}) as status, \
                        patch.object(installed_sdk.Device, 'close', lambda device: closed.add(id(device))):
                    with self.assertRaises(models.AppError) as caught:
                        self.send({'power': True, 'brightness': 50}, config=config)
                self.assertEqual(emissions, [(control, expected, True)], 'SDK retried or split the normalized payload')
                self.assertEqual((caught.exception.status, caught.exception.code), (502, 'command_result_unknown'))
                self.assertEqual(caught.exception.receipt['delivery'], 'unknown')
                self.assertEqual(status.call_count, prereads)
                self.assertEqual(len(closed), 1)

    @unittest.skipIf(installed_sdk is None, 'run with project .venv to exercise installed TinyTuya')
    def test_installed_sdk_receive_timeout_does_not_resend_and_closes_socket(self):
        # Exercise actual TinyTuya framing/retry loop, replacing only socket I/O.
        transmissions, closed, connections = [], [], []
        class Wire:
            def sendall(self, payload):
                transmissions.append(len(payload))
            def close(self):
                closed.append(True)
            def settimeout(self, timeout):
                pass
        def connect(device, renew):
            connections.append(device.socketRetryLimit)
            device.socket = Wire()
            return True
        def receive(device):
            raise socket.timeout('synthetic receive timeout')
        with patch.dict(sys.modules, {'tinytuya': installed_sdk}), \
                patch.object(installed_sdk.Device, '_get_socket', connect), \
                patch.object(installed_sdk.Device, '_receive', receive):
            with self.assertRaises(models.AppError) as caught:
                self.send(config={**light(), 'protocol': 3.3})
        self.assertEqual(caught.exception.code, 'command_result_unknown')
        self.assertEqual(caught.exception.receipt['delivery'], 'unknown')
        self.assertEqual(len(transmissions), 1)
        self.assertEqual(connections, [1])
        self.assertEqual(len(closed), 1)

    def test_generic_dp_normalizes_values_and_respects_remaining_io_timeout(self):
        config = {**light(), 'adapter': 'dp', 'schema': {
            'power': {'dp': '1', 'encoding': 'bool'},
            'brightness': {'dp': '2', 'encoding': 'integer', 'min': 10, 'max': 1000}}}
        self.sdk.reads = [{'dps': {'1': True, '2': 505}}]
        result = adapters.send(config, {'action': 'set', 'values': {'power': True, 'brightness': 50}}, {},
                               context=models.command_context(budget=0.25))
        self.assertEqual(self.writes(), [('set', {'1': True, '2': 505})])
        self.assertEqual(result['receipt']['outcome'], 'confirmed')
        self.assertEqual(result['receipt']['confirmedFields'], ['brightness', 'power'])
        self.assertTrue(all(0 < timeout <= 0.25 for timeout in self.sdk.instances[0].timeouts))

    def test_power_only_has_one_write_one_reconciliation_no_preread(self):
        self.sdk.reads = [{'dps': {'20': True}}]
        result = self.send()
        self.assertEqual(self.sdk.calls, [('set', {'20': True}), 'read'])
        self.assertEqual(result['receipt']['confirmedFields'], ['power'])
        self.assertEqual(result['receipt']['delivery'], 'sent')
        self.assertTrue(all(instance.closed for instance in self.sdk.instances))

    def test_F1_late_complete_null_ack_keeps_proof_and_overrun(self):
        self.sdk.ack = None
        def late():
            self.clock.value = 6.5
            return {'dps': {'20': True}}
        self.sdk.reads = [late]
        result = self.send()
        self.assertEqual((result['status'], result['confidence']), ('sent', 'reported'))
        receipt = result['receipt']
        self.assertEqual((receipt['outcome'], receipt['delivery']), ('confirmed', 'unknown'))
        self.assertEqual(receipt['reported'], {'power': True})
        self.assertEqual(receipt['timing'], {'budgetMs': 6000, 'elapsedMs': 6500, 'overrunMs': 500})
        self.assertEqual(len(self.writes()), 1)
        self.assertTrue(self.sdk.instances[0].closed)

    def test_F2_partial_divergence_survives_error(self):
        self.sdk.reads = [{'dps': {'20': False, '21': 'white', '22': 500}},
                          {'dps': {'20': False}, 'Error': 'partial transport failure', 'Err': '902'}]
        with self.assertRaises(models.AppError) as caught:
            self.send({'power': True, 'brightness': 50})
        error = caught.exception
        self.assertEqual((error.status, error.code), (502, 'command_result_unknown'))
        self.assertEqual(error.receipt['reported'], {'power': False})
        self.assertEqual(error.receipt['divergedFields'], ['power'])
        self.assertEqual(error.receipt['confirmedFields'], [])
        self.assertEqual((error.receipt['outcome'], error.receipt['delivery']), ('diverged', 'sent'))
        self.assertIsNotNone(error.receipt['observedAt'])
        self.assertEqual(len(self.writes()), 1)

    def test_partial_does_not_confirm_power_and_null_ack_divergence_is_unknown(self):
        for reply, outcome in (({'21': 'white', '22': 500}, 'unconfirmed'), ({'20': False}, 'diverged')):
            with self.subTest(outcome=outcome):
                self.sdk.ack, self.sdk.reads = None, [{'dps': reply}]
                receipt = self.send()['receipt']
                self.assertEqual(receipt['outcome'], outcome)
                self.assertEqual(receipt['delivery'], 'unknown')
                self.assertNotIn('power', receipt['confirmedFields'])

    def test_expired_before_emit_never_writes_and_expired_after_emit_never_reads(self):
        context = models.command_context()
        self.clock.value = 6
        with self.assertRaises(models.AppError) as caught:
            adapters.send(light(), {'action': 'set', 'values': {'power': True}}, {}, context=context)
        self.assertEqual(caught.exception.code, 'command_deadline_exceeded')
        self.assertEqual(self.writes(), [])
        self.clock.value = 0
        self.sdk.on_set = lambda: setattr(self.clock, 'value', 7)
        with self.assertRaises(models.AppError) as caught:
            self.send()
        self.assertEqual((caught.exception.status, caught.exception.receipt['delivery']), (502, 'sent'))
        self.assertEqual(caught.exception.receipt['timing']['overrunMs'], 1000)
        self.assertNotIn('read', self.sdk.calls)
        self.assertEqual(len(self.writes()), 1)

    def test_F4_ir_key_exception_after_entry_is_unknown_and_before_is_not_sent(self):
        self.sdk.ack = OSError('synthetic send failed')
        command = {'action': 'key', 'key': 'power'}
        with self.assertRaises(models.AppError) as caught:
            self.send(config=infrared(), command=command)
        receipt = caught.exception.receipt
        self.assertEqual((caught.exception.status, caught.exception.code), (502, 'command_result_unknown'))
        self.assertEqual((receipt['delivery'], receipt['outcome']), ('unknown', 'unconfirmed'))
        self.assertEqual((receipt['requested'], receipt['reported'], receipt['confirmedFields']), ({}, {}, []))
        self.assertEqual(len(self.writes()), 1)
        self.sdk.calls.clear()
        context = models.command_context()
        self.clock.value = 10
        with self.assertRaises(models.AppError) as caught:
            adapters.send(infrared(), command, {}, context=context)
        self.assertEqual(caught.exception.code, 'command_deadline_exceeded')
        self.assertEqual(caught.exception.receipt['delivery'], 'not_sent')
        self.assertEqual(self.writes(), [])

    def test_ir_set_and_key_accepted_without_telemetry_never_confirm(self):
        self.sdk.ack = None
        for command, confidence in (({'action': 'set', 'values': {'power': False}}, 'estimated'),
                                    ({'action': 'key', 'key': 'power'}, 'unknown')):
            with self.subTest(command=command):
                result = self.send(config=infrared(), command=command)
                self.assertEqual((result['status'], result['confidence']), ('sent', confidence))
                self.assertEqual(result['receipt']['outcome'], 'unconfirmed')
                self.assertEqual(result['receipt']['delivery'], 'unknown')
                self.assertEqual(result['receipt']['reported'], {})
                self.assertIsNone(result['receipt']['observedAt'])

    def test_quantization_uses_encoder_roundtrip_for_zero_brightness_and_colour(self):
        self.sdk.reads = [{'dps': {'20': True, '21': 'white', '22': 500}},
                          {'dps': {'21': 'white', '22': 10}}]
        result = self.send({'brightness': 0})
        self.assertEqual(result['receipt']['requested'], {'brightness': 0})
        self.assertEqual(result['receipt']['reported'], {'brightness': 1})
        self.assertEqual(result['receipt']['outcome'], 'confirmed')
        self.sdk.reads = [{'dps': {'21': 'white', '22': 500}},
                          {'dps': {'21': 'colour', '24': '000003e801f4'}}]
        self.assertEqual(self.send({'colorHex': '#ff0000'})['receipt']['outcome'], 'confirmed')


class AppContractTest(OfflineCase):
    def test_snapshot_versions_physical_aliases_and_field_age(self):
        config = {'quarto-luz': light(), 'banheiro-luz': light('fake-light-b'),
                  'ar-quarto': {**infrared(), 'schema': {'off': 'AAA='}},
                  'tv-quarto': {**infrared(), 'schema': {'power': 'AAA='}}}
        app = self.make_app(config)
        initial = app.snapshot(True)
        self.assertIn('stateVersion', initial)
        devices = {device['id']: device for device in initial['devices']}
        self.assertEqual(devices['ar-quarto']['physicalId'], devices['tv-quarto']['physicalId'])
        self.assertNotEqual(devices['quarto-luz']['physicalId'], devices['banheiro-luz']['physicalId'])
        self.assertEqual(devices['quarto-luz']['fieldObservations'], {})
        self.assertIsNone(devices['quarto-luz']['observedAt'])
        self.assertNotEqual(initial['stateVersion']['epoch'], initial['csrfToken'])
        self.sdk.reads = [{'dps': {'20': True}}]
        result = app.command('quarto-luz', {'action': 'set', 'values': {'power': True}})
        self.assertEqual(result['device'], result['state']['devices'][0])
        self.assertEqual(result['command']['receipt']['stateVersion'], result['state']['stateVersion'])
        old_power_observation = result['device']['fieldObservations']['power']
        self.sdk.reads = [{'dps': {'21': 'white', '22': 500}}]
        result2 = app.command('quarto-luz', {'action': 'set', 'values': {'power': False}})
        self.assertEqual(result2['device']['state']['power'], True)
        self.assertEqual(result2['command']['receipt']['outcome'], 'unconfirmed')
        self.assertEqual(result2['device']['fieldObservations']['power'], old_power_observation)
        self.assertGreater(result2['state']['stateVersion']['revision'], result['state']['stateVersion']['revision'])
        self.assertNotEqual(self.make_app(config).snapshot()['stateVersion']['epoch'], initial['stateVersion']['epoch'])

    def test_error_receipt_and_snapshot_keep_partial_divergence(self):
        app = self.make_app()
        self.sdk.reads = [{'dps': {'20': False, '21': 'white', '22': 500}},
                          {'dps': {'20': False}, 'Error': 'partial'}]
        with self.assertRaises(models.AppError) as caught:
            app.command('quarto-luz', {'action': 'set', 'values': {'power': True, 'brightness': 50}})
        receipt = caught.exception.receipt
        self.assertIsNotNone(receipt)
        self.assertEqual(receipt['outcome'], 'diverged')
        snapshot = app.snapshot()
        self.assertLess(receipt['stateVersion']['revision'], snapshot['stateVersion']['revision'])
        self.assertEqual(snapshot['devices'][0]['state']['power'], False)
        self.assertIn('power', snapshot['devices'][0]['fieldObservations'])

    def test_F3_poll_keeps_physical_lock_through_commit(self):
        app = self.make_app()
        self.assertTrue(hasattr(app, '_poll_device'), 'poll needs bounded physical worker')
        read_done, poll_done, command_done = threading.Event(), threading.Event(), threading.Event()
        outcomes = []
        def read(config):
            read_done.set()
            return {'power': False}
        def poll():
            try:
                app._poll_device(app.devices[0])
            finally:
                poll_done.set()
        def command():
            try:
                outcomes.append(app.command('quarto-luz', {'action': 'set', 'values': {'power': True}}))
            except Exception as error:
                outcomes.append(error)
            finally:
                command_done.set()
        self.sdk.reads = [{'dps': {'20': True}}]
        with patch.object(adapters, 'read', read), app.lock:
            reader = threading.Thread(target=poll)
            reader.start()
            self.assertTrue(read_done.wait(1))
            self.assertTrue(app.device_locks['quarto-luz'].locked())
            sender = threading.Thread(target=command)
            sender.start()
            self.assertEqual(self.writes(), [])
        self.assertTrue(poll_done.wait(1))
        self.assertTrue(command_done.wait(1))
        reader.join(1)
        sender.join(1)
        self.assertIsInstance(outcomes[0], dict)
        self.assertEqual(app.snapshot()['devices'][0]['state']['power'], True)
        self.assertLess(outcomes[0]['state']['stateVersion']['revision'], app.snapshot()['stateVersion']['revision'])

    def test_inflight_keeps_lock_other_physical_progresses_timeout_never_runs_later(self):
        app = self.make_app({'quarto-luz': light(), 'banheiro-luz': light('fake-light-b')})
        self.assertIn('context', __import__('inspect').signature(app.command).parameters)
        entered, release, finished = threading.Event(), threading.Event(), threading.Event()
        outcomes = []
        def pause_first():
            if not entered.is_set():
                entered.set()
                if not release.wait(2):
                    raise RuntimeError('test synchronization failed')
        self.sdk.on_set = pause_first
        self.sdk.reads = [{'dps': {'20': True}}, {'dps': {'20': True}}]
        def command():
            try:
                outcomes.append(app.command('quarto-luz', {'action': 'set', 'values': {'power': True}}))
            except Exception as error:
                outcomes.append(error)
            finally:
                finished.set()
        thread = threading.Thread(target=command)
        thread.start()
        try:
            self.assertTrue(entered.wait(1))
            self.assertTrue(app.device_locks['quarto-luz'].locked())
            # Cached GET remains available while physical I/O is blocked.
            self.assertIn('stateVersion', app.snapshot())
            with self.assertRaises(models.AppError) as caught:
                app.command('quarto-luz', {'action': 'set', 'values': {'power': False}},
                            context=models.command_context(budget=0.02))
            self.assertEqual(caught.exception.receipt['delivery'], 'not_sent')
            self.assertEqual(caught.exception.code, 'command_deadline_exceeded')
            independent = app.command('banheiro-luz', {'action': 'set', 'values': {'power': True}})
            self.assertEqual(independent['command']['receipt']['outcome'], 'confirmed')
            self.assertTrue(app.device_locks['quarto-luz'].locked())
        finally:
            release.set()
            finished.wait(2)
            thread.join(1)
        self.assertEqual(len(self.writes()), 2)
        self.assertIsInstance(outcomes[0], dict)

    def test_preview_and_ir_preserve_legacy_updated_at_without_physical_observations(self):
        app = self.make_app({'ar-quarto': {**infrared(), 'schema': {'off': 'AAA='}}})
        self.sdk.ack = None
        result = app.command('ar-quarto', {'action': 'set', 'values': {'power': False}})
        device = result['device']
        self.assertIsNotNone(device['updatedAt'])
        self.assertIsNotNone(device['estimatedAt'])
        self.assertIsNone(device['observedAt'])
        self.assertEqual(device['fieldObservations'], {})
        preview = application.CasaApp('preview', self.directory / 'preview')
        response = preview.command('quarto-luz', {'action': 'set', 'values': {'power': False}})
        self.assertEqual((response['command']['status'], response['command']['receipt']['outcome']), ('preview', 'preview'))
        self.assertEqual(response['command']['receipt']['delivery'], 'not_sent')
        self.assertEqual(response['command']['receipt']['reported'], {})

    def test_poll_workers_are_bounded_by_physical_groups(self):
        app = self.make_app({'quarto-luz': light(), 'banheiro-luz': light('fake-light-b'),
                             'ar-quarto': {**infrared(), 'schema': {'off': 'AAA='}},
                             'tv-quarto': {**infrared(), 'schema': {'power': 'AAA='}}})
        workers = []
        class CapturedThread:
            def __init__(self, **kwargs):
                workers.append(kwargs)
            def start(self):
                pass
        with patch.object(application.threading, 'Thread', CapturedThread):
            app.start_polling()
            app.start_polling()
        self.assertEqual(len(workers), 3)

    def test_slow_poll_isolated_and_second_poll_on_same_physical_skipped(self):
        app = self.make_app({'quarto-luz': light(), 'banheiro-luz': light('fake-light-b')})
        entered, release, finished = threading.Event(), threading.Event(), threading.Event()
        reads = []
        def read(config):
            reads.append(config['providerId'])
            if config['providerId'] == 'fake-light-a':
                entered.set()
                if not release.wait(2):
                    raise RuntimeError('test synchronization failed')
                return {'power': False}
            return {'power': True}
        def poll():
            try:
                app._poll_device(app.devices[0])
            finally:
                finished.set()
        with patch.object(adapters, 'read', read):
            thread = threading.Thread(target=poll)
            thread.start()
            try:
                self.assertTrue(entered.wait(1))
                app._poll_device(app.devices[0])
                app._poll_device(app.devices[1])
                snapshot = app.snapshot()
                self.assertIsNone(snapshot['devices'][0]['state']['power'])
                self.assertTrue(snapshot['devices'][1]['state']['power'])
                self.assertEqual(reads.count('fake-light-a'), 1)
            finally:
                release.set()
                finished.wait(2)
                thread.join(1)
        self.assertFalse(app.snapshot()['devices'][0]['state']['power'])

    def test_shared_ir_learning_blocks_sibling_key_but_not_independent_light(self):
        app = self.make_app({'quarto-luz': light(),
                             'ar-quarto': {**infrared(), 'schema': {'off': 'AAA='}},
                             'tv-quarto': {**infrared(), 'schema': {'power': 'AAA='}}})
        entered, release, finished = threading.Event(), threading.Event(), threading.Event()
        outcomes = []
        def learn(config):
            entered.set()
            if not release.wait(2):
                raise RuntimeError('test synchronization failed')
            return 'AAA='
        def learning():
            try:
                outcomes.append(app.learn('ar-quarto', {'key': 'off'}))
            except Exception as error:
                outcomes.append(error)
            finally:
                finished.set()
        with patch.object(adapters, 'learn', learn):
            thread = threading.Thread(target=learning)
            thread.start()
            try:
                self.assertTrue(entered.wait(1))
                with self.assertRaises(models.AppError) as caught:
                    app.command('tv-quarto', {'action': 'key', 'key': 'power'}, context=models.command_context(budget=0.02))
                self.assertEqual(caught.exception.receipt['delivery'], 'not_sent')
                self.sdk.reads = [{'dps': {'20': True}}]
                response = app.command('quarto-luz', {'action': 'set', 'values': {'power': True}})
                self.assertEqual(response['command']['receipt']['outcome'], 'confirmed')
            finally:
                release.set()
                finished.wait(2)
                thread.join(1)
        self.assertIsInstance(outcomes[0], dict)
        self.assertEqual(len(self.writes()), 1)

    def test_non_cancellable_overrun_retains_lock_until_sdk_returns(self):
        app = self.make_app()
        entered, release, finished = threading.Event(), threading.Event(), threading.Event()
        outcomes = []
        def blocking_send():
            entered.set()
            if not release.wait(2):
                raise RuntimeError('test synchronization failed')
        self.sdk.on_set = blocking_send
        def command():
            try:
                app.command('quarto-luz', {'action': 'set', 'values': {'power': True}})
            except models.AppError as error:
                outcomes.append(error)
            finally:
                finished.set()
        thread = threading.Thread(target=command)
        thread.start()
        try:
            self.assertTrue(entered.wait(1))
            self.clock.value = 7
            self.assertTrue(app.device_locks['quarto-luz'].locked())
            self.assertFalse(finished.is_set())
            self.assertIsNone(app.snapshot()['devices'][0]['state']['power'])
        finally:
            release.set()
            finished.wait(2)
            thread.join(1)
        self.assertEqual(len(outcomes), 1)
        self.assertEqual(outcomes[0].code, 'command_result_unknown')
        self.assertEqual(outcomes[0].receipt['timing']['overrunMs'], 1000)
        self.assertFalse(app.device_locks['quarto-luz'].locked())
        self.assertEqual(self.sdk.calls, [('set', {'20': True})])
        self.assertTrue(all(instance.closed for instance in self.sdk.instances))


class SceneRoutineTest(OfflineCase):
    def test_mixed_five_step_fixture_and_confirmed_plus_expected_ir(self):
        # Public modes stay restricted to existing devices and set steps. Exercise
        # the real aggregator with real command outputs; do not add IR-key scenes.
        app = self.make_app({'quarto-luz': light(), 'ar-quarto': {**infrared(), 'schema': {'off': 'AAA='}}})
        self.assertTrue(hasattr(app, '_step_result'), 'missing step aggregation')
        cases = [({}, [{'dps': {'20': True}}], 'quarto-luz', True),
                 ({}, [{'dps': {}}], 'quarto-luz', False),
                 ({}, [{'dps': {'20': False}}], 'quarto-luz', True),
                 (TimeoutError('after emission'), [], 'quarto-luz', False),
                 (None, [], 'ar-quarto', False)]
        results = []
        for ack, reads, device, power in cases:
            self.sdk.ack, self.sdk.reads = ack, reads
            try:
                response = app.command(device, {'action': 'set', 'values': {'power': power}})
                results.append(app._step_result(device, response['command']))
            except models.AppError as error:
                results.append(app._step_result(device, error=error))
        self.assertEqual(application.summarize_evidence(results, 'local'), {'status': 'partial', 'evidenceSummary': {
            'confirmed': 1, 'unconfirmed': 3, 'diverged': 1, 'notApplicable': 0, 'preview': 0, 'operationalFailures': 1}})
        self.assertEqual(application.summarize_evidence([results[0], results[4]], 'local'), {'status': 'completed',
            'evidenceSummary': {'confirmed': 1, 'unconfirmed': 1, 'diverged': 0, 'notApplicable': 0, 'preview': 0, 'operationalFailures': 0}})
        self.assertEqual(len(self.writes()), 5)
        self.assertEqual(len({step['receipt']['requestId'] for step in results}), 5)

    def test_F5_ir_only_aggregation_has_expected_unconfirmed_without_false_failure(self):
        app = self.make_app({'ar-quarto': {**infrared(), 'schema': {'off': 'AAA='}},
                             'tv-quarto': {**infrared(), 'schema': {'power': 'AAA='}}})
        self.assertTrue(hasattr(app, '_step_result'), 'missing operation/evidence aggregation')
        self.sdk.ack = None
        results = []
        for device, command in (('ar-quarto', {'action': 'set', 'values': {'power': False}}),
                                ('tv-quarto', {'action': 'key', 'key': 'power'})):
            response = app.command(device, command)
            results.append(app._step_result(device, response['command']))
        summary = application.summarize_evidence(results, 'local')
        self.assertEqual(summary, {'status': 'completed', 'evidenceSummary': {
            'confirmed': 0, 'unconfirmed': 2, 'diverged': 0, 'notApplicable': 0, 'preview': 0, 'operationalFailures': 0}})
        self.assertTrue(all(not step['confirmationExpected'] for step in results))
        self.assertTrue(all(step['receipt']['delivery'] == 'unknown' for step in results))
        self.assertEqual(results[1]['receipt']['requested'], {})
        self.assertNotEqual(results[0]['receipt']['requestId'], results[1]['receipt']['requestId'])
        self.assertEqual(len(self.writes()), 2)

    def test_F6_real_scene_continues_after_dp_failure_to_expected_ir(self):
        app = self.make_app({'quarto-luz': light(), 'banheiro-luz': light('fake-light-b'),
                             'ar-quarto': {**infrared(), 'schema': {'off': 'AAA='}}})
        self.sdk.reads = [{'dps': {'20': True}}]
        def ack_for_step():
            self.sdk.ack = {1: {}, 2: TimeoutError('uncertain'), 3: None}[len(self.writes())]
        self.sdk.on_set = ack_for_step
        response = app.scene('boa-noite')
        self.assertIn('evidenceSummary', response)
        self.assertEqual(response['status'], 'partial')
        self.assertEqual(response['evidenceSummary'], {'confirmed': 0, 'unconfirmed': 2,
            'diverged': 1, 'notApplicable': 0, 'preview': 0, 'operationalFailures': 1})
        # The built-in mode requests off, so a true observation is an honest divergence.
        self.assertEqual(response['results'][0]['evidence'], 'diverged')
        self.assertEqual(response['results'][1]['receipt']['delivery'], 'unknown')
        self.assertEqual(response['results'][2]['operation'], 'accepted')
        self.assertEqual(len(self.writes()), 3)
        # Exact F6 fixture: same legal mode with the DP report matching off.
        self.sdk.calls.clear()
        self.sdk.reads = [{'dps': {'20': False}}]
        response = app.scene('boa-noite')
        self.assertEqual(response['evidenceSummary'], {'confirmed': 1, 'unconfirmed': 2,
            'diverged': 0, 'notApplicable': 0, 'preview': 0, 'operationalFailures': 1})
        self.assertTrue(response['results'][0]['confirmationExpected'])
        self.assertFalse(response['results'][2]['confirmationExpected'])
        revisions = [step['receipt']['stateVersion']['revision'] for step in response['results']]
        self.assertEqual(revisions, sorted(revisions))
        self.assertLess(revisions[-1], response['state']['stateVersion']['revision'])
        self.assertEqual(len({step['receipt']['requestId'] for step in response['results']}), 3)

    def test_F7_partial_diverged_error_stays_diverged_in_scene_summary(self):
        app = self.make_app()
        self.assertTrue(hasattr(app, '_step_result'), 'missing evidence aggregation')
        self.sdk.reads = [{'dps': {'20': False, '21': 'white', '22': 500}},
                          {'dps': {'20': False}, 'Error': 'partial'}]
        with self.assertRaises(models.AppError) as caught:
            app.command('quarto-luz', {'action': 'set', 'values': {'power': True, 'brightness': 50}})
        step = app._step_result('quarto-luz', error=caught.exception)
        self.assertEqual((step['operation'], step['evidence'], step['status']), ('failed', 'diverged', 'failed'))
        self.assertEqual(step['receipt']['reported'], {'power': False})
        self.assertEqual(application.summarize_evidence([step], 'local'), {'status': 'partial', 'evidenceSummary': {
            'confirmed': 0, 'unconfirmed': 0, 'diverged': 1, 'notApplicable': 0, 'preview': 0, 'operationalFailures': 1}})

    def test_scene_skips_keep_if_on_and_preview_does_not_claim_confirmation(self):
        app = self.make_app({'ar-quarto': {**infrared(), 'schema': {'off': 'AAA='}}})
        app.devices[2]['state']['power'] = True
        mode = {'id': 'keep', 'name': 'Keep', 'steps': {'ar-quarto': {'power': True, 'keepIfOn': True}}}
        with patch.object(app.modes, 'get', return_value=mode):
            response = app.scene('keep')
        self.assertIn('evidenceSummary', response)
        self.assertEqual(response['results'][0]['operation'], 'skipped')
        self.assertEqual(response['results'][0]['receipt'], None)
        self.assertEqual(response['evidenceSummary']['notApplicable'], 1)
        self.assertEqual(self.writes(), [])
        preview = application.CasaApp('preview', self.directory / 'preview')
        response = preview.scene('boa-noite')
        self.assertEqual(response['status'], 'preview')
        self.assertEqual(response['evidenceSummary']['preview'], 3)

    def test_routine_records_uncertainty_without_adding_retry(self):
        app = self.make_app({'ar-quarto': {**infrared(), 'schema': {'off': 'AAA='}}})
        self.sdk.ack = None
        scheduler = routines.Routines(app, self.directory, clock=lambda: 1000)
        self.assertTrue(scheduler.run('off', {'type': 'device', 'device': 'ar-quarto', 'values': {'power': False}}))
        self.assertIn('receipt', scheduler.log[-1])
        self.assertEqual(scheduler.log[-1]['receipt']['delivery'], 'unknown')
        self.assertTrue(scheduler.log[-1]['uncertain'])
        self.assertEqual(len(self.writes()), 1)
        self.assertEqual(scheduler.timers, [])

    def test_timer_records_receipt_per_attempt_preserving_ten_attempt_policy(self):
        app = self.make_app({'ar-quarto': {**infrared(), 'schema': {'off': 'AAA='}}})
        scheduler = routines.Routines(app, self.directory, clock=lambda: 1000)
        scheduler.set_timer({'device': 'ar-quarto', 'minutes': 15})
        timer_id = scheduler.timers[0]['id']
        self.sdk.ack = TimeoutError('after emission')
        for attempt in range(10):
            self.assertFalse(scheduler.run('timer', {'type': 'device', 'device': 'ar-quarto',
                                                   'values': {'power': False}}, timer_id))
            self.assertIn('receipt', scheduler.log[-1])
            self.assertEqual(scheduler.log[-1]['receipt']['delivery'], 'unknown')
            if attempt < 9:
                self.assertEqual(scheduler.timers[0]['at'], 1060)
                self.assertEqual(scheduler.timers[0]['attempts'], attempt + 1)
        self.assertEqual(scheduler.timers, [])
        self.assertEqual(len(self.writes()), 10)
        self.assertEqual(len({row['receipt']['requestId'] for row in scheduler.log}), 10)


class BoundaryTest(unittest.TestCase):
    def test_context_immutable_opaque_unique_and_custom_budget(self):
        self.assertTrue(hasattr(models, 'command_context'), 'missing shared boundary')
        first = models.command_context(now=10, budget=2)
        second = models.command_context(now=10, budget=2)
        self.assertEqual(first.deadline, 12)
        self.assertTrue(first.request_id)
        self.assertNotEqual(first.request_id, second.request_id)
        with self.assertRaises(FrozenInstanceError):
            first.deadline = 20
        with patch.object(models.time, 'monotonic', return_value=12):
            with self.assertRaises(models.AppError) as caught:
                models.ensure_command_time(first)
        self.assertEqual((caught.exception.status, caught.exception.code),
                         (504, 'command_deadline_exceeded'))

    def test_budget_validation_and_legacy_error(self):
        self.assertTrue(hasattr(models, 'command_context'), 'missing shared boundary')
        for budget in (0, -1, float('inf'), float('nan'), True):
            with self.subTest(budget=budget), self.assertRaises(ValueError):
                models.command_context(budget=budget)
        legacy = models.AppError('legacy', 409, 'legacy')
        self.assertIsNone(legacy.receipt)
        receipt = {'delivery': 'unknown'}
        error = models.AppError('uncertain', 502, 'command_result_unknown', receipt=receipt)
        self.assertEqual(error.receipt, receipt)


if __name__ == '__main__':
    unittest.main()
