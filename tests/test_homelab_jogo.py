"""Modo jogo sem WSL de verdade: runner falso grava os comandos.  python -m unittest tests.test_homelab_jogo"""
import json
import os
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
        self.calls, self.cwds, self.up_codes = [], [], list(up_codes)

    def __call__(self, args, timeout=60, cwd=None):
        self.calls.append(list(args))
        self.cwds.append(cwd)
        if "--running" in args:
            return 0, "homelab\n"
        if "ps" in args:  # docker ps: um pesado acordou no modo jogo
            return 0, "\n".join(json.dumps({"Names": n, "State": "running"}) for n in ("radarr", "ntfy"))
        if "up" in args:
            return (self.up_codes.pop(0) if self.up_codes else 0), ""
        return 0, ""


def make(runner):
    lab = homelab.Homelab(tempfile.mkdtemp(), runner=runner, machine=FakeMachine())
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
        # No Linux nativo não há VM do WSL para devolver memória.
        (self.assertIn if os.name == "nt" else self.assertNotIn)(homelab.RECLAIM, [c[-1] for c in runner.calls])

    def test_back_to_lab_retries_failed_up(self):
        runner = Runner(up_codes=(1, 0))
        lab = make(runner)
        lab.mode = "jogo"
        homelab.time.sleep, sleep = (lambda s: None), homelab.time.sleep
        try:
            lab._switch("lab", "manual")
        finally:
            homelab.time.sleep = sleep
        ups = [c for c, d in zip(runner.calls, runner.cwds) if "up" in c and d != homelab.RUNNERS]
        self.assertEqual(len(ups), 2)
        self.assertEqual(lab.mode, "lab")


    def test_game_mode_stops_runners_and_lab_brings_them_back(self):
        runner = Runner()
        lab = make(runner)
        homelab.NATIVE, native = True, homelab.NATIVE
        homelab.os.path.isdir, isdir = (lambda p: True), homelab.os.path.isdir
        homelab.time.sleep, sleep = (lambda s: None), homelab.time.sleep
        try:
            lab._switch("jogo", "manual")
            lab._switch("lab", "manual")
        finally:
            homelab.NATIVE, homelab.os.path.isdir, homelab.time.sleep = native, isdir, sleep
        runner_calls = [c for c, d in zip(runner.calls, runner.cwds) if d == homelab.RUNNERS]
        self.assertEqual(runner_calls, [["docker", "compose", "stop"], ["docker", "compose", "up", "-d"]])


if __name__ == "__main__":
    unittest.main()
