"""Home lab e modo jogo com os comandos do Windows simulados (sem WSL nem Docker de verdade)."""
import json
from pathlib import Path
import tempfile
import unittest

from backend import homelab
from backend.homelab import Homelab
from backend.models import AppError


class FakeWindows:
    """Responde como wsl.exe, schtasks, tasklist e docker; guarda o que foi chamado."""

    def __init__(self):
        self.calls, self.running, self.processes = [], True, ["explorer.exe"]

    def __call__(self, args, timeout=60):
        self.calls.append(args)
        joined = " ".join(args)
        if "--running" in args:
            return 0, "homelab\n" if self.running else ""
        if "--shutdown" in args:
            self.running = False
            return 0, ""
        if args[0] == "schtasks" and "/run" in args:
            self.running = True
            return 0, ""
        if args[0] == "tasklist":
            return 0, "\n".join(f'"{name}","123","Console","1","1.000 K"' for name in self.processes)
        if "docker" in args and "ps" in args:
            return 0, json.dumps({"Names": "jellyfin", "State": "running", "Status": "Up 5 minutes"}) + "\n"
        return 0, joined


class Still:
    def cpu(self):
        return 7

    def gpu(self):
        return {"name": "RTX", "temp": 41.0}

    def disks(self):
        return []

    def wsl_memory(self):
        return 2.1


class Clock:
    def __init__(self):
        self.now = 1_000_000.0

    def __call__(self):
        return self.now


class HomelabTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.windows, self.clock = FakeWindows(), Clock()
        self.lab = Homelab(Path(self.temporary.name), runner=self.windows, machine=Still(), clock=self.clock)

    def tearDown(self):
        self.temporary.cleanup()

    def commands(self):
        return [" ".join(c) for c in self.windows.calls]

    def test_game_mode_stops_stack_and_frees_wsl_then_comes_back(self):
        self.lab._switch("jogo", "manual")
        self.assertEqual(self.lab.mode, "jogo")
        self.assertFalse(self.windows.running)
        text = "\n".join(self.commands())
        self.assertIn("docker compose stop", text)
        self.assertIn("schtasks /end /tn CasaLocal-homelab", text)
        self.assertTrue(any(c[-1] == "--shutdown" for c in self.windows.calls))
        self.windows.calls.clear()
        self.lab._switch("lab", "manual")
        self.assertTrue(self.windows.running)
        self.assertIn("docker compose up -d", "\n".join(self.commands()))

    def test_status_does_not_wake_the_distro_during_game(self):
        self.lab._switch("jogo", "manual")
        self.windows.calls.clear()
        self.lab.tick()
        self.assertFalse(any("ps" in c for c in self.windows.calls), "não pode chamar docker com a distro desligada")
        status = self.lab.status()
        self.assertEqual(status["mode"], "jogo")
        self.assertFalse(status["wsl"])
        self.assertEqual(next(s for s in status["services"] if s["id"] == "jellyfin")["state"], "stopped")

    def test_auto_enters_with_game_and_leaves_two_minutes_after(self):
        self.windows.processes.append("cs2.exe")
        self.lab.tick()
        self.assertEqual((self.lab.mode, self.lab.reason), ("jogo", "auto:cs2.exe"))
        self.windows.processes.remove("cs2.exe")
        self.lab.tick()
        self.assertEqual(self.lab.mode, "jogo")  # espera 2 min (ex.: trocar de partida)
        self.clock.now += homelab.AUTO_EXIT_SECONDS
        self.lab.tick()
        self.assertEqual(self.lab.mode, "lab")

    def test_manual_game_mode_is_not_undone_by_auto(self):
        self.lab._switch("jogo", "manual")
        self.clock.now += 3600
        self.lab.tick()
        self.assertEqual(self.lab.mode, "jogo")

    def test_auto_off_ignores_games_and_setting_persists(self):
        self.lab.enabled = True
        self.lab.set_mode({"auto": False})
        self.windows.processes.append("cs2.exe")
        self.lab.tick()
        self.assertEqual(self.lab.mode, "lab")
        again = Homelab(Path(self.temporary.name), runner=self.windows, machine=Still())
        self.assertFalse(again.auto)

    def test_validation_and_preview(self):
        for body in ({}, {"mode": "festa"}, {"auto": "sim"}, {"mode": "lab", "extra": 1}):
            with self.subTest(body=body), self.assertRaises(AppError):
                self.lab.set_mode(body)
        preview = Homelab(Path(self.temporary.name), enabled=False, runner=self.windows, machine=Still())
        with self.assertRaises(AppError):
            preview.set_mode({"mode": "jogo"})

    def test_status_lists_services_with_links(self):
        self.lab.tick()
        status = self.lab.status()
        jellyfin = next(s for s in status["services"] if s["id"] == "jellyfin")
        self.assertEqual((jellyfin["state"], jellyfin["port"], jellyfin["https"]), ("running", 8096, 10000))
        self.assertEqual(status["stats"]["gpu"]["temp"], 41.0)
        self.assertEqual(status["stats"]["wslGb"], 2.1)


if __name__ == "__main__":
    unittest.main()
