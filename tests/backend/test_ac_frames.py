"""Calibração bit a bit dos quadros do ar com quadros sintéticos (nenhum código real)."""
import base64
import random
import struct
import unittest
from unittest.mock import patch

from backend import ac_frames, adapters
from backend.adapters import climate_code_key
from backend.config import validate_config
from backend.models import AppError, validate_command
from test_climate_profile import ir_config, profile_schema

FIX = [[0, 22, 1], [1, 1, 0], [1, 8, 1]]


def frame(seg0, seg1, tail=1000, long=1690):
    """Quadro no formato do ar: cabeçalho, 35 bits, pausa, 32 bits, pulso final e pausa final."""
    pulses = [9000, 4500]
    for index, segment in enumerate((seg0, seg1)):
        for bit in segment:
            pulses += [600, long if bit else 560]
        pulses += [600, 20000 if index == 0 else tail]
    return base64.b64encode(struct.pack(f"<{len(pulses)}H", *pulses)).decode()


def state_bits(seed):
    rng = random.Random(seed)
    return [rng.randint(0, 1) for _ in range(35)], [rng.randint(0, 1) for _ in range(32)]


def remote(seg0, seg1, turbo=False):
    """O que o controle original enviaria para o mesmo estado: bits fixos e o do turbo."""
    seg0, seg1 = list(seg0), list(seg1)
    for segment, index, value in FIX:
        (seg0 if segment == 0 else seg1)[index] = value
    seg0[20] = 1 if turbo else 0
    return frame(seg0, seg1, tail=52000, long=1650)


class FrameTests(unittest.TestCase):
    def setUp(self):
        self.a = state_bits(1)
        self.b = state_bits(2)
        for seg0, _seg1 in (self.a, self.b):
            seg0[22], seg0[20] = 0, 0
        self.a[1][1] = self.b[1][1] = 1
        self.a[1][8] = self.b[1][8] = 0

    def test_trailing_pause_is_not_a_bit(self):
        self.assertEqual([len(s) for s in ac_frames.bits(frame(*self.a))], [35, 32])

    def test_calibration_reproduces_recordings_and_turbo(self):
        pairs = [(frame(*self.a), remote(*self.a)), (frame(*self.b), remote(*self.b))]
        calibration = ac_frames.calibrate(pairs, (remote(*self.a), remote(*self.a, turbo=True)))
        self.assertEqual(calibration, {"fix": FIX, "turbo": [0, 20]})
        self.assertTrue(ac_frames.validate(calibration))
        for profile, recorded in pairs:
            self.assertEqual(ac_frames.bits(ac_frames.adjust(profile, calibration)), ac_frames.bits(recorded))
        turbo = ac_frames.adjust(frame(*self.b), calibration, turbo=True)
        self.assertEqual(ac_frames.bits(turbo), ac_frames.bits(remote(*self.b, turbo=True)))

    def test_inconsistent_or_single_recording_is_refused(self):
        with self.assertRaises(ValueError):
            ac_frames.calibrate([(frame(*self.a), remote(*self.a))])
        odd = list(self.b[0]); odd[3] ^= 1
        with self.assertRaises(ValueError):
            ac_frames.calibrate([(frame(*self.a), remote(*self.a)), (frame(odd, self.b[1]), remote(*self.b))])
        with self.assertRaises(ValueError):
            ac_frames.calibrate([(frame(*self.a), remote(*self.a)), (frame(*self.b), remote(*self.b))], (remote(*self.a), remote(*self.b)))

    def test_validate_rejects_malformed(self):
        for bad in ({"fix": [[0, 99, 1]]}, {"fix": [[0, 1, 2]]}, {"turbo": [0]}, {"outro": []}, []):
            self.assertFalse(ac_frames.validate(bad))


class TurboSendTests(unittest.TestCase):
    def setUp(self):
        self.seg = state_bits(3)
        self.seg[0][20] = self.seg[0][22] = 0
        self.schema = profile_schema()
        self.schema[climate_code_key({"power": True, "temperature": 22, "mode": "cool", "fan": "medium"})] = {"code": frame(*self.seg), "origem": "geonav-perfil", "validado": False}
        self.current = {"power": True, "temperature": 22, "mode": "cool", "fan": "medium", "turbo": False}

    def send(self, values, frame_fix):
        config = {**ir_config(self.schema), **({"frameFix": frame_fix} if frame_fix else {})}
        with patch("tinytuya.Contrib.IRRemoteControlDevice.IRRemoteControlDevice.send_button") as button, \
             patch("tinytuya.Device.set_retry"), patch("tinytuya.Device.close"):
            try:
                return adapters.send(config, validate_command("climate", {"action": "set", "values": values}), dict(self.current)), button
            except AppError as error:
                return error, button

    def test_turbo_sets_bit_on_corrected_frame(self):
        result, button = self.send({"turbo": True}, {"fix": FIX, "turbo": [0, 20]})
        self.assertTrue(result["state"]["turbo"])
        sent = ac_frames.bits(button.call_args.args[0])
        self.assertEqual((sent[0][20], sent[0][22], sent[1][1], sent[1][8]), (1, 1, 0, 1))

    def test_turbo_without_calibration_is_refused(self):
        error, button = self.send({"turbo": True}, None)
        self.assertEqual(error.code, "ir_not_learned")
        button.assert_not_called()

    def test_power_off_clears_turbo(self):
        self.current["turbo"] = True
        result, _button = self.send({"power": False}, {"fix": FIX, "turbo": [0, 20]})
        self.assertFalse(result["state"]["turbo"])

    def test_config_accepts_only_valid_calibration_on_ac(self):
        validate_config({"ar-quarto": {**ir_config(self.schema), "frameFix": {"fix": FIX, "turbo": [0, 20]}}})
        with self.assertRaises(AppError):
            validate_config({"ar-quarto": {**ir_config(self.schema), "frameFix": {"fix": [[0, 1, 5]]}}})
