"""Modo jogo sem WSL de verdade: runner falso grava os comandos.  python -m unittest tests.test_homelab_jogo"""
import json
import tempfile
import unittest

from backend import homelab


class FakeMachine:
    def cpu(self): return None
    def gpu(self): return None
    def disks(self): return []
    def wsl_memory(self): return 0.0


class Runner:
    def __init__(self, up_codes=(0,)):
        self.calls, self.up_codes = [], list(up_codes)

    def __call__(self, args, timeout=60):
        self.calls.append(list(args))
        if "--running" in args:
            return 0, "homelab\n"
        if "ps" in args:  # docker ps: um pesado acordou no modo jogo
            return 0, "\n".join(json.dumps({"Names": n, "State": "running"}) for n in ("radarr", "ntfy"))
        if "up" in args:
            return (self.up_codes.pop(0) if self.up_codes else 0), ""
        return 0, ""


def make(runner):
    lab = homelab.Homelab(tempfile.mkdtemp(), runner=runner, machine=FakeMachine(), presence=lambda: True)
    lab.auto = False
    return lab


class GameModeTest(unittest.TestCase):
    def test_tick_stops_awake_container_by_name_and_reclaims(self):
        runner = Runner()
        lab = make(runner)
        lab.mode = "jogo"
        lab.tick()
        stops = [c for c in runner.calls if c[-2:] == ["stop", "radarr"]]
        self.assertTrue(stops and "compose" not in stops[0], runner.calls)
        self.assertIn(homelab.RECLAIM, [c[-1] for c in runner.calls])

    def test_back_to_lab_retries_failed_up(self):
        runner = Runner(up_codes=(1, 0))
        lab = make(runner)
        lab.mode = "jogo"
        homelab.time.sleep, sleep = (lambda s: None), homelab.time.sleep
        try:
            lab._switch("lab", "manual")
        finally:
            homelab.time.sleep = sleep
        self.assertEqual(sum(1 for c in runner.calls if "up" in c), 2)
        self.assertEqual(lab.mode, "lab")


if __name__ == "__main__":
    unittest.main()
