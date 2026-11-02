import json
import tempfile
import types
import unittest
from unittest.mock import patch

from backend import homelab


class Machine:
    def cpu(self): return None
    def gpu(self): return None
    def disks(self): return []
    def wsl_memory(self): return None


class Docker:
    def __init__(self, state):
        self.state, self.calls = state, []
        self.query = (0, 'adguard\nradarr\nntfy\n')
        self.start_code = 0
        self.up_codes = []

    def __call__(self, args, timeout=60, cwd=None):
        self.calls.append(list(args))
        if 'ps' in args:
            rows = [('radarr', 'running'), ('ntfy', 'running')]
            if self.state is not None:
                rows.append(('casalocal-adguard', self.state))
            return 0, '\n'.join(json.dumps({'Names': n, 'State': s}) for n, s in rows)
        if 'config' in args:
            return self.query
        if 'start' in args:
            return self.start_code, ''
        if 'up' in args and self.up_codes:
            return self.up_codes.pop(0), ''
        return 0, ''


class ReliabilityTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.docker = Docker('running')
        self.lab = homelab.Homelab(self.temp.name, runner=self.docker, machine=Machine())
        self.lab.auto = False
        self.lab.reclaim = lambda: None
        self.lab.runners = lambda action: None
        self.health = patch.dict('sys.modules', {'backend.health': types.SimpleNamespace(machine=lambda: {})})
        self.health.start()
        self.addCleanup(self.health.stop)

    def test_game_switch_and_watchdog_preserve_dns_and_stop_heavy(self):
        self.lab._switch('jogo', 'manual')
        self.lab.tick()
        stops = [c for c in self.docker.calls if 'stop' in c]
        self.assertTrue(any('compose' in c and 'radarr' in c for c in stops))
        self.assertTrue(any('compose' not in c and 'radarr' in c for c in stops))
        self.assertTrue(all('adguard' not in c and 'casalocal-adguard' not in c for c in stops))

    def test_lab_restores_only_existing_stopped_container(self):
        for state in ('exited', 'created', 'running', None):
            with self.subTest(state=state):
                self.docker.state = state
                self.docker.calls.clear()
                self.lab.mode = 'jogo'
                self.lab._switch('lab', 'manual')
                starts = [c for c in self.docker.calls if 'start' in c]
                self.assertEqual(starts, [[*homelab.DOCKER, 'start', 'casalocal-adguard']] if state in ('exited', 'created') else [])
                ups = [c for c in self.docker.calls if 'up' in c]
                self.assertEqual(ups, [[*homelab.DOCKER, 'compose', 'up', '-d', '--no-deps', 'ntfy', 'radarr']])

    def test_boot_for_all_dns_states_never_creates_or_recreates_dns(self):
        self.lab.running_games = lambda: []
        self.lab.tailnet_host = lambda: None
        self.lab.stop_event.set()
        class ImmediateThread:
            def __init__(self, target, **kwargs): self.target = target
            def start(self): self.target()
        for state in ('exited', 'created', 'running', None):
            with self.subTest(state=state):
                self.docker.state = state
                self.docker.calls.clear()
                self.lab.thread = None
                with patch.object(homelab.threading, 'Thread', ImmediateThread):
                    self.lab.start()
                starts = [c for c in self.docker.calls if 'start' in c]
                self.assertEqual(starts, [[*homelab.DOCKER, 'start', 'casalocal-adguard']] if state in ('exited', 'created') else [])
                ups = [c for c in self.docker.calls if 'up' in c]
                self.assertEqual(ups, [[*homelab.DOCKER, 'compose', 'up', '-d', '--no-deps', 'ntfy', 'radarr']])

    def test_boot_restores_dns_even_if_game_open(self):
        self.docker.state = 'exited'
        self.lab.running_games = lambda: ['cs2.exe']
        self.lab.tailnet_host = lambda: None
        self.lab.stop_event.set()
        class ImmediateThread:
            def __init__(self, target, **kwargs): self.target = target
            def start(self): self.target()
        with patch.object(homelab.threading, 'Thread', ImmediateThread): self.lab.start()
        self.assertIn([*homelab.DOCKER, 'start', 'casalocal-adguard'], self.docker.calls)

    def test_retry_uses_same_complete_safe_compose_command(self):
        self.docker.up_codes = [1, 0]
        with patch.object(homelab.time, 'sleep'):
            self.assertTrue(self.lab.start_lab_services())
        ups = [c for c in self.docker.calls if 'up' in c]
        expected = [*homelab.DOCKER, 'compose', 'up', '-d', '--no-deps', 'ntfy', 'radarr']
        self.assertEqual(ups, [expected, expected])

    def test_failed_or_uncertain_enumeration_never_runs_up(self):
        for query in ((1, 'error'), (0, ''), (0, 'warning: uncertain\nadguard\nradarr')):
            with self.subTest(query=query):
                self.docker.query = query
                self.docker.calls.clear()
                with self.assertLogs('backend.homelab', level='WARNING'):
                    self.assertFalse(self.lab.start_lab_services())
                self.assertFalse(any('up' in c for c in self.docker.calls))

    def test_enumeration_failure_in_lab_and_boot_never_runs_up(self):
        self.docker.query = (1, 'indisponível')
        self.lab.mode = 'jogo'
        with self.assertLogs('backend.homelab', level='WARNING'):
            self.lab._switch('lab', 'manual')
        self.assertFalse(any('up' in c for c in self.docker.calls))
        self.docker.calls.clear()
        self.lab.running_games = lambda: []
        self.lab.tailnet_host = lambda: None
        self.lab.stop_event.set()
        class ImmediateThread:
            def __init__(self, target, **kwargs): self.target = target
            def start(self): self.target()
        with patch.object(homelab.threading, 'Thread', ImmediateThread), self.assertLogs('backend.homelab', level='WARNING'):
            self.lab.start()
        self.assertFalse(any('up' in c for c in self.docker.calls))

    def test_failed_dns_start_is_logged_in_lab_and_boot(self):
        self.docker.state, self.docker.start_code = 'exited', 1
        self.lab.mode = 'jogo'
        with self.assertLogs('backend.homelab', level='WARNING') as logs:
            self.lab._switch('lab', 'manual')
        self.assertTrue(any('DNS' in line for line in logs.output))
        self.lab.running_games = lambda: []
        self.lab.tailnet_host = lambda: None
        self.lab.stop_event.set()
        class ImmediateThread:
            def __init__(self, target, **kwargs): self.target = target
            def start(self): self.target()
        with patch.object(homelab.threading, 'Thread', ImmediateThread), self.assertLogs('backend.homelab', level='WARNING') as logs:
            self.lab.start()
        self.assertTrue(any('DNS' in line for line in logs.output))


if __name__ == '__main__':
    unittest.main()
