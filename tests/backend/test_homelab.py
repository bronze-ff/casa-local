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
        self.ps_code, self.ps_body = 0, None

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
        if "config" in args and "--services" in args:
            return 0, "jellyfin\nntfy\nfrigate\nvaultwarden\nqbittorrent\n"
        if "docker" in args and "ps" in args:
            if self.ps_code != 0:
                return self.ps_code, "erro ao ler containers"
            if self.ps_body is not None:
                return 0, self.ps_body
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

    def test_game_mode_stops_only_heavy_services_and_comes_back(self):
        self.lab._switch("jogo", "manual")
        self.assertEqual(self.lab.mode, "jogo")
        stop = next(c for c in self.windows.calls if "stop" in c)
        self.assertEqual(stop[-3:], ["frigate", "jellyfin", "qbittorrent"])  # ntfy e vaultwarden ficam
        self.assertTrue(any("drop_caches" in " ".join(c) for c in self.windows.calls))
        self.assertTrue(self.windows.running, "a distro fica ligada para os avisos")
        self.windows.calls.clear()
        self.lab._switch("lab", "manual")
        self.assertIn("docker compose up -d", "\n".join(self.commands()))

    def test_game_mode_stops_services_docker_brought_back(self):
        self.lab._switch("jogo", "manual")
        self.windows.calls.clear()
        self.lab.tick()  # o Docker religou o jellyfin depois do boot
        self.assertIn("docker compose stop jellyfin", "\n".join(self.commands()))
        self.windows.calls.clear()
        self.lab._switch("lab", "manual")
        self.windows.calls.clear()
        self.lab.tick()
        self.assertFalse(any("stop jellyfin" in c for c in self.commands()), "no modo lab nada é parado")

    def test_failed_docker_read_is_unknown_and_does_not_act(self):
        self.windows.ps_body = "\n".join([
            json.dumps({"Names": "jellyfin", "State": "running", "Status": "Up 5 minutes"}),
            json.dumps({"Names": "frigate", "State": "running", "Status": "Up 5 minutes"}),
        ]) + "\n"
        self.lab.presence = lambda: False
        self.lab.tick()
        self.windows.calls.clear()
        self.windows.ps_code = -1  # timeout
        self.lab.tick()
        states = {s["id"]: s["state"] for s in self.lab.status()["services"]}
        self.assertTrue(all(state == "unknown" for state in states.values()))
        self.assertIsNone(next(s["status"] for s in self.lab.status()["services"] if s["id"] == "jellyfin"))
        self.assertFalse(any("compose" in " ".join(c) for c in self.windows.calls), "leitura ruim não liga nem para serviço")
        self.windows.ps_code = 0
        self.lab.tick()
        self.assertEqual(next(s["state"] for s in self.lab.status()["services"] if s["id"] == "jellyfin"), "running")

    def test_status_does_not_wake_a_stopped_distro(self):
        self.windows.running = False
        self.lab.tick()
        self.assertFalse(any("ps" in c for c in self.windows.calls), "não pode chamar docker com a distro desligada")
        status = self.lab.status()
        self.assertFalse(status["wsl"])
        self.assertEqual(next(s for s in status["services"] if s["id"] == "jellyfin")["state"], "stopped")

    def test_tick_drops_linux_cache_every_ten_minutes(self):
        self.lab.tick()
        self.lab.tick()
        self.assertEqual(sum("drop_caches" in " ".join(c) for c in self.windows.calls), 1)
        self.clock.now += 600
        self.lab.tick()
        self.assertEqual(sum("drop_caches" in " ".join(c) for c in self.windows.calls), 2)

    def test_restart_validation(self):
        self.lab.set_mode({"restart": "ntfy"})
        with self.assertRaises(AppError):
            self.lab.set_mode({"restart": "rm -rf"})
        self.lab._switch("jogo", "manual")
        with self.assertRaises(AppError):
            self.lab.set_mode({"restart": "jellyfin"})

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

    def test_frigate_follows_presence_and_choice(self):
        home = {"value": True}
        lab = Homelab(Path(self.temporary.name), runner=self.windows, machine=Still(), clock=self.clock, presence=lambda: home["value"])
        lab.containers = {"frigate": {"state": "running"}}
        lab.apply_frigate()
        self.assertTrue(any(c[-2:] == ["stop", "frigate"] for c in self.windows.calls), "em casa: Frigate desliga")
        self.windows.calls.clear()
        home["value"] = False
        lab.containers = {"frigate": {"state": "exited"}}
        lab.apply_frigate()
        self.assertTrue(any(c[-3:] == ["up", "-d", "frigate"] for c in self.windows.calls), "fora: Frigate liga")
        home["value"] = None
        self.assertFalse(lab.frigate_wanted(), "sem localização: fica desligado")
        self.windows.calls.clear()
        lab.set_mode({"frigate": "nunca"})
        self.assertFalse(lab.frigate_wanted())
        self.assertEqual(Homelab(Path(self.temporary.name), runner=self.windows, machine=Still()).frigate_mode, "nunca")
        with self.assertRaises(AppError):
            lab.set_mode({"frigate": "talvez"})

    def test_frigate_on_follows_the_container(self):
        self.lab.containers_ok = True
        self.lab.running = True
        self.lab.presence = lambda: False  # desejado: fora de casa
        self.lab.containers = {"frigate": {"state": "exited", "status": "Exited (1) 2 minutes ago"}}
        status = self.lab.status()
        self.assertFalse(status["frigateOn"])
        self.assertTrue(status["frigateWanted"])
        self.lab.mode, self.lab.frigate_mode = "jogo", "sempre"
        self.assertTrue(self.lab.status()["frigateWanted"])
        self.assertFalse(self.lab.status()["frigateOn"], "modo jogo: desejado, mas o container está parado")
        self.lab.containers["frigate"]["state"] = "running"
        self.assertTrue(self.lab.status()["frigateOn"])
        self.lab.containers_ok = False
        failed = self.lab.status()
        self.assertFalse(failed["frigateOn"])
        self.assertEqual(next(s["state"] for s in failed["services"] if s["id"] == "frigate"), "unknown")

    def test_status_lists_services_with_links(self):
        self.lab.tick()
        status = self.lab.status()
        jellyfin = next(s for s in status["services"] if s["id"] == "jellyfin")
        self.assertEqual((jellyfin["state"], jellyfin["link"]), ("running", {"kind": "path", "target": "/jellyfin"}))
        self.assertEqual(len(status["history"]), 1)
        self.assertEqual(status["stats"]["gpu"]["temp"], 41.0)
        self.assertEqual(status["stats"]["wslGb"], 2.1)

    def test_tailnet_host_empty_at_boot_is_none(self):
        answers = iter([json.dumps({"Self": {"DNSName": ""}}), json.dumps({"Self": {"DNSName": "pc.exemplo.ts.net."}})])
        lab = Homelab(Path(self.temporary.name), runner=lambda args, timeout=60: (0, next(answers)), machine=Still())
        self.assertIsNone(lab.tailnet_host(), "nome vazio no boot não vira link https:///jellyfin")
        self.assertEqual(lab.tailnet_host(), "pc.exemplo.ts.net")


if __name__ == "__main__":
    unittest.main()
