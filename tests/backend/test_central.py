"""Rotinas, gasto do ar, movimento das câmeras, TVs pela rede e saúde/backup, sem rede nem aparelhos."""
from datetime import datetime
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from backend.app import CasaApp
from backend.energy import AcUsage
from backend.health import Backups
from backend.models import AppError
from backend.motion import MotionWatcher
from backend.routines import Routines
from backend.samsung_tv import SamsungTVs


class Clock:
    def __init__(self, moment):
        self.now = moment.timestamp()

    def __call__(self):
        return self.now


class Temp(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.dir = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()


class RoutineTests(Temp):
    def setUp(self):
        super().setUp()
        self.clock = Clock(datetime(2026, 10, 19, 6, 58))  # segunda-feira
        self.app = CasaApp(data_dir=self.dir)
        self.routines = Routines(self.app, self.dir, clock=self.clock)

    def add(self, **extra):
        body = {"name": "Desligar ar cedo", "days": [0, 1, 2, 3, 4], "time": "07:00",
                "action": {"type": "device", "device": "ar-quarto", "values": {"power": False}}, **extra}
        return self.routines.save(body)["routines"][-1]

    def test_runs_once_in_window_and_only_on_chosen_days(self):
        routine = self.add()
        self.assertEqual(datetime.fromtimestamp(routine["next"]).strftime("%a %H:%M"), "Mon 07:00")
        self.assertEqual(self.routines.due(), [])
        self.clock.now += 3 * 60  # 07:01
        due = self.routines.due()
        self.assertEqual([name for name, *_ in due], ["Desligar ar cedo"])
        self.assertEqual(self.routines.due(), [])  # não repete no mesmo dia
        self.clock.now += 5 * 86400  # sábado 07:01
        self.assertEqual(self.routines.due(), [])

    def test_missed_by_more_than_grace_is_skipped(self):
        self.add()
        self.clock.now += 12 * 60  # 07:10
        self.assertEqual(self.routines.due(), [])

    def test_creating_at_the_same_minute_does_not_fire_immediately(self):
        self.clock.now += 2 * 60  # 07:00
        self.add()
        self.assertEqual(self.routines.due(), [])

    def test_saving_inside_the_grace_window_does_not_fire(self):
        self.clock.now += 5 * 60  # 07:03, ainda dentro dos 5 min da rotina das 07:00
        routine = self.add()
        self.assertEqual(self.routines.due(), [])
        self.routines.save({"id": routine["id"], "name": "Outro nome", "days": [0, 1, 2, 3, 4], "time": "07:01",
                            "action": {"type": "device", "device": "ar-quarto", "values": {"power": False}}})
        self.assertEqual(self.routines.due(), [])

    def test_run_uses_app_command_and_logs(self):
        self.add()
        self.clock.now += 3 * 60
        for name, action, timer_id in self.routines.due():
            self.assertTrue(self.routines.run(name, action, timer_id))
        device = next(d for d in self.app.devices if d["id"] == "ar-quarto")
        self.assertFalse(device["state"]["power"])
        self.assertTrue(self.app.recent[0]["message"].startswith("Rotina Desligar ar cedo"))
        self.assertEqual(self.routines.status()["log"][0]["name"], "Desligar ar cedo")

    def test_sleep_timer(self):
        self.routines.set_timer({"device": "ar-quarto", "minutes": 120})
        self.assertEqual(len(self.routines.status()["timers"]), 1)
        self.clock.now += 119 * 60
        self.assertEqual(self.routines.due(), [])
        self.clock.now += 2 * 60
        due = self.routines.due()
        self.assertEqual([name for name, *_ in due], ["Desligar o ar"])
        self.routines.run(*due[0])
        self.assertEqual(self.routines.status()["timers"], [])
        with self.assertRaises(AppError):
            self.routines.set_timer({"device": "ar-quarto", "minutes": 5})

    def test_failed_timer_is_retried_then_dropped(self):
        self.routines.set_timer({"device": "ar-quarto", "minutes": 15})
        self.clock.now += 16 * 60
        failing = {"type": "device", "device": "ar-quarto", "values": {"power": "não"}}  # força AppError
        for attempt in range(10):
            name, _, timer_id = self.routines.due()[0]
            self.assertFalse(self.routines.run(name, failing, timer_id))
            remaining = self.routines.status()["timers"]
            if attempt < 9:
                self.assertEqual(len(remaining), 1)
                self.assertEqual(self.routines.due(), [])  # espera 1 min antes de tentar de novo
                self.clock.now += 61
        self.assertEqual(self.routines.status()["timers"], [])

    def test_validation(self):
        for bad in ({"days": []}, {"time": "25:00"}, {"name": ""},
                    {"action": {"type": "device", "device": "tv-quarto", "values": {"power": False}}},
                    {"action": {"type": "device", "device": "ar-quarto", "values": {"temperature": 99}}},
                    {"action": {"type": "scene", "id": "inexistente"}}):
            with self.assertRaises(AppError):
                self.add(**bad)
        self.assertEqual(self.routines.status()["routines"], [])

    def test_persists_and_removes(self):
        routine = self.add()
        again = Routines(self.app, self.dir, clock=self.clock)
        self.assertEqual(again.status()["routines"][0]["id"], routine["id"])
        again.remove(routine["id"])
        self.assertEqual(again.status()["routines"], [])


class EnergyTests(Temp):
    def test_hours_and_cost_from_sessions(self):
        clock = Clock(datetime(2026, 10, 19, 20, 0))
        usage = AcUsage(self.dir, clock=clock)
        usage.observe(True)
        clock.now += 2 * 3600
        usage.observe(True)  # repetido não abre outra sessão
        usage.observe(False)
        summary = usage.summary()
        self.assertEqual(summary["today"]["hours"], 2.0)
        self.assertEqual(summary["today"]["kwh"], 1.8)
        self.assertEqual(summary["today"]["cost"], round(1.8 * 0.95, 2))
        usage.configure({"watts": 1200, "tariff": 1.0})
        self.assertEqual(AcUsage(self.dir, clock=clock).summary()["today"]["cost"], 2.4)
        with self.assertRaises(ValueError):
            usage.configure({"watts": 50})

    def test_open_session_counts_until_now_and_is_capped(self):
        clock = Clock(datetime(2026, 10, 19, 1, 0))
        usage = AcUsage(self.dir, clock=clock)
        usage.observe(True)
        clock.now += 3600
        self.assertEqual(usage.summary()["today"]["hours"], 1.0)
        self.assertTrue(usage.summary()["on"])
        clock.now += 30 * 3600
        self.assertLessEqual(usage.summary()["month"]["hours"], 16.0)


class FakeCameras:
    def recent(self, camera_id):
        return b"", 1e9

    def _fetch(self, camera_id):
        return b"\xff\xd8jpeg"


class MotionTests(Temp):
    def setUp(self):
        super().setUp()
        self.clock = Clock(datetime(2026, 10, 19, 22, 0))
        self.motion = MotionWatcher(FakeCameras(), self.dir, source=lambda: None, clock=self.clock)

    def test_start_stop_merge_and_unknown_channels(self):
        event = self.motion.handle("Code=VideoMotion;action=Start;index=3")
        self.assertEqual(event["camera"], "cam4")
        self.clock.now += 10
        self.motion.handle("Code=VideoMotion;action=Stop;index=3")
        self.clock.now += 30
        self.assertIsNone(self.motion.handle("Code=VideoMotion;action=Start;index=3"))  # junta ao anterior
        self.assertIsNone(self.motion.handle("Code=VideoMotion;action=Start;index=9"))  # canal 10 não existe
        self.assertIsNone(self.motion.handle("Heartbeat"))
        events = self.motion.status()["events"]
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["count"], 2)
        self.clock.now += 200
        self.motion.handle("Code=VideoMotion;action=Stop;index=3")
        self.clock.now += 200
        self.assertIsNotNone(self.motion.handle("Code=VideoMotion;action=Start;index=3"))

    def test_open_event_without_stop_does_not_swallow_later_motion(self):
        first = self.motion.handle("Code=VideoMotion;action=Start;index=2")
        self.clock.now += 60
        self.assertIsNone(self.motion.handle("Code=VideoMotion;action=Start;index=2"))  # ainda o mesmo
        self.clock.now += 10 * 60  # conexão caiu sem Stop; muito tempo depois, movimento novo
        later = self.motion.handle("Code=VideoMotion;action=Start;index=2")
        self.assertIsNotNone(later)
        events = self.motion.status()["events"]
        self.assertEqual([e["id"] for e in events], [later["id"], first["id"]])
        self.assertIsNotNone(events[1]["end"])

    def test_count_cap_also_deletes_photos(self):
        import backend.motion as motion_module
        original, motion_module.MAX_EVENTS = motion_module.MAX_EVENTS, 2
        try:
            first = self.motion.handle("Code=VideoMotion;action=Start;index=0")
            self.motion._snapshot(first)
            for index in (1, 3):
                self.clock.now += 1
                self.motion.handle(f"Code=VideoMotion;action=Start;index={index}")
            self.assertFalse((self.dir / "movimento" / f"{first['id']}.jpg").exists())
        finally:
            motion_module.MAX_EVENTS = original

    def test_quiet_camera_is_listed_even_behind_busy_ones(self):
        self.motion.handle("Code=VideoMotion;action=Start;index=12")  # cam13, a quieta
        for step in range(400):  # outra câmera muito movimentada depois disso
            self.clock.now += 100
            self.motion.handle(f"Code=VideoMotion;action=Start;index={step % 2}")
            self.motion.handle(f"Code=VideoMotion;action=Stop;index={step % 2}")
        self.assertNotIn("cam13", [e["camera"] for e in self.motion.status()["events"]])
        quiet = self.motion.status(camera="cam13")["events"]
        self.assertEqual([e["camera"] for e in quiet], ["cam13"])
        self.assertEqual(len(self.motion.events), 401)  # nada foi cortado dentro das 24 h
        with self.assertRaises(AppError):
            self.motion.status(camera="cam99")

    def test_each_trigger_is_kept_for_the_replay_timeline(self):
        self.motion.handle("Code=VideoMotion;action=Start;index=5")
        start = self.clock.now
        self.clock.now += 8
        self.motion.handle("Code=VideoMotion;action=Stop;index=5")
        self.clock.now += 40
        self.motion.handle("Code=VideoMotion;action=Start;index=5")  # junta ao evento, novo disparo
        self.clock.now += 5
        self.motion.handle("Code=VideoMotion;action=Start;index=5")  # repetido com o disparo aberto
        self.clock.now += 5
        self.motion.handle("Code=VideoMotion;action=Stop;index=5")
        event = self.motion.status()["events"][0]
        self.assertEqual(event["hits"], [[start, start + 8], [start + 48, start + 58]])

    def test_stale_snapshot_is_skipped(self):
        event = self.motion.handle("Code=VideoMotion;action=Start;index=6")
        self.clock.now += 300
        self.motion._snapshot(event)
        self.assertFalse(self.motion.status()["events"][0]["photo"])

    def test_events_use_dvr_clock_and_old_ones_are_shifted_once(self):
        old = self.motion.handle("Code=VideoMotion;action=Start;index=12")  # gravado na hora do PC
        self.motion.set_offset(92)  # DVR 92 s adiantado
        self.assertEqual(self.motion.status()["events"][0]["start"], old["start"] + 92)
        new = self.motion.handle("Code=VideoMotion;action=Start;index=4")
        self.assertEqual(new["start"], self.clock.now + 92)  # carimbado na hora do DVR
        self.motion.set_offset(95)  # nova medição não desloca de novo
        self.assertEqual(self.motion.status(camera="cam13")["events"][0]["start"], old["start"] + 92)
        again = MotionWatcher(FakeCameras(), self.dir, source=lambda: None, clock=self.clock)
        self.assertEqual((again.offset, again.dvr_clock), (95, True))

    def test_disconnect_closes_open_events(self):
        self.motion.handle("Code=VideoMotion;action=Start;index=4")
        self.motion.close_open()
        self.assertIsNotNone(self.motion.status()["events"][0]["end"])

    def test_photo_notify_unseen_and_retention(self):
        event = self.motion.handle("Code=VideoMotion;action=Start;index=0")
        self.motion._snapshot(event)
        self.assertEqual(self.motion.photo(event["id"]), b"\xff\xd8jpeg")
        self.assertTrue(self.motion.status()["events"][0]["photo"])
        self.assertEqual(self.motion.status()["unseen"], 0)
        self.motion.set_notify({"camera": "cam1", "on": True})
        self.assertEqual(self.motion.status()["unseen"], 1)
        self.motion.mark_seen()
        self.assertEqual(self.motion.status()["unseen"], 0)
        self.motion.set_notify({"camera": "cam2", "on": True})
        self.clock.now += 400  # passa da janela de evento aberto: o próximo disparo é um evento novo
        self.motion.handle("Code=VideoMotion;action=Start;index=0")
        self.motion.handle("Code=VideoMotion;action=Start;index=1")
        self.assertEqual(self.motion.status()["unseenBy"], {"cam1": 1, "cam2": 1})
        self.motion.mark_seen({"camera": "cam2"})  # abrir só a câmera 2 não zera a 1
        self.assertEqual((self.motion.status()["unseenBy"], self.motion.status()["unseen"]), ({"cam1": 1}, 1))
        with self.assertRaises(AppError):
            self.motion.mark_seen({"camera": "cam99"})
        with self.assertRaises(AppError):
            self.motion.photo("../segredo")
        self.clock.now += 49 * 3600
        self.motion.handle("Code=VideoMotion;action=Start;index=1")
        self.assertEqual([e["camera"] for e in self.motion.status(hours=100)["events"]], ["cam2"])
        self.assertFalse((self.dir / "movimento" / f"{event['id']}.jpg").exists())


class FakeChannel:
    sent = []

    def __init__(self, ip, token=None, timeout=8):
        self.token = token
        self.replies = [{"event": "ms.channel.connect", "data": {"token": "98765"}}] if token in (None, "98765") else [{"event": "ms.channel.unauthorized"}]

    def receive(self):
        return self.replies.pop(0)

    def send(self, message):
        FakeChannel.sent.append(message)

    def close(self):
        pass


class TvTests(Temp):
    def setUp(self):
        super().setUp()
        FakeChannel.sent = []
        found = [{"ip": "192.168.0.50", "mac": "AA:BB:CC:00:11:22", "model": "UN50RU7100", "power": "on", "size": "50"}]
        self.tvs = SamsungTVs(self.dir, scanner=lambda: found, connector=FakeChannel)
        self.tvs.refresh(force=True)
        self.key = "aabbcc001122"

    def test_discovery_pairing_and_commands(self):
        status = self.tvs.status()["tvs"][0]
        self.assertEqual((status["id"], status["label"], status["paired"], status["power"]), (self.key, 'TV 50"', False, "on"))
        with self.assertRaises(AppError):
            self.tvs.command(self.key, {"key": "volume_up"})
        self.tvs.pair(self.key)
        self.assertTrue(SamsungTVs(self.dir, scanner=lambda: [], connector=FakeChannel).status()["tvs"][0]["paired"])
        self.tvs.command(self.key, {"key": "volume_up"})
        self.tvs.command(self.key, {"app": "youtube"})
        self.assertEqual(FakeChannel.sent[0]["params"]["DataOfCmd"], "KEY_VOLUP")
        self.assertEqual(FakeChannel.sent[1]["params"]["data"]["appId"], "111299001912")
        with self.assertRaises(AppError):
            self.tvs.command(self.key, {"key": "rm -rf"})
        self.tvs.rename(self.key, "TV da sala")
        self.assertEqual(self.tvs.status()["tvs"][0]["label"], "TV da sala")
        self.assertNotIn(b"98765", (self.dir / "tvs.dpapi").read_bytes())

    def test_power_on_when_off_only_wakes(self):
        self.tvs.tvs[self.key]["token"] = "98765"
        self.tvs.live[self.key]["power"] = "off"
        woke = []
        self.tvs.wake = lambda key: woke.append(key)
        result = self.tvs.command(self.key, {"key": "power"})
        self.assertEqual(woke, [self.key])
        self.assertEqual(FakeChannel.sent, [])  # sem KEY_POWER logo depois do Wake-on-LAN
        self.assertIn("alguns segundos", result["message"])

    def test_revoked_token_is_cleared(self):
        self.tvs.tvs[self.key]["token"] = "velho"
        with self.assertRaises(AppError) as error:
            self.tvs.command(self.key, {"key": "mute"})
        self.assertEqual(error.exception.code, "tv_unpaired")
        self.assertFalse(self.tvs.status()["tvs"][0]["paired"])

    def test_pairing_requires_tv_on(self):
        self.tvs.live[self.key]["power"] = "standby"
        with self.assertRaises(AppError):
            self.tvs.pair(self.key)


class PreviewSafetyTests(Temp):
    """Na prévia nada físico acontece nem altera dados reais (revisão do PR #1)."""

    def setUp(self):
        super().setUp()
        from backend.server import CasaServer
        self.dist = self.dir / "dist"
        self.dist.mkdir()
        (self.dist / "index.html").write_text("<html></html>", encoding="utf-8")
        self.server = CasaServer(("127.0.0.1", 0), CasaApp(data_dir=self.dir / "data"), self.dist)

    def tearDown(self):
        self.server.server_close()
        super().tearDown()

    def test_tv_commands_pairing_and_scan_are_refused(self):
        self.server.tvs.tvs = {"aabbcc001122": {"label": "TV", "ip": "192.0.2.5", "mac": "AA:BB:CC:00:11:22", "token": "x"}}
        for call in (lambda: self.server.tvs.command("aabbcc001122", {"key": "power"}), lambda: self.server.tvs.pair("aabbcc001122"),
                     lambda: self.server.tvs.refresh(force=True)):
            with self.assertRaises(AppError) as error:
                call()
            self.assertEqual(error.exception.code, "preview_mode")

    def test_routines_use_separate_file_and_ac_usage_is_not_recorded(self):
        self.server.routines.set_timer({"device": "ar-quarto", "minutes": 60})
        self.server.energy.configure({"watts": 1500})
        self.server.motion.mark_seen()
        self.server.tvs.tvs = {"aabbcc001122": {"label": "TV", "ip": "192.0.2.5", "mac": "AA:BB:CC:00:11:22", "token": None}}
        self.server.tvs.rename("aabbcc001122", "Sala")
        data = self.dir / "data"
        self.assertEqual(sorted(p.name for p in data.iterdir()), ["previa"])  # nada real foi tocado
        self.assertTrue((data / "previa" / "rotinas.json").exists())
        self.server.app.command("ar-quarto", {"action": "set", "values": {"power": True}})
        self.assertFalse(self.server.energy.summary()["on"])
        self.assertIsNone(self.server.routines.thread)


class BackupTests(Temp):
    def test_daily_zip_without_motion_photos_keeps_seven(self):
        data, target = self.dir / "data", self.dir / "backups"
        (data / "movimento").mkdir(parents=True)
        (data / "devices.dpapi").write_bytes(b"cifrado")
        (data / "movimento" / "eventos.json").write_text("{}", encoding="utf-8")
        (data / "movimento" / "1-abc.jpg").write_bytes(b"jpeg")
        clock = Clock(datetime(2026, 10, 1, 3, 0))
        backups = Backups(data, target, clock=clock)
        for day in range(10):
            backups.run()
            clock.now += 86400
        files = sorted(target.glob("*.zip"))
        self.assertEqual(len(files), 7)
        with zipfile.ZipFile(files[-1]) as archive:
            self.assertEqual(sorted(archive.namelist()), ["devices.dpapi", "movimento/eventos.json"])
        clock.now -= 86400
        self.assertIsNone(backups.run())  # já existe o do dia
