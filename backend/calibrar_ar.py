"""Calibra os quadros do ar comparando gravações do controle original com o perfil Geonav, offline.

Uso (no PC de casa): python -m backend.calibrar_ar          mostra o resultado
                     python -m backend.calibrar_ar --apply  salva a calibração no cadastro DPAPI

Precisa de pelo menos dois estados completos gravados com Aprender (ex.: 22 °C auto e 24 °C média)
e, para o turbo, da tecla "turbo" gravada no mesmo estado de uma dessas gravações. Não envia IR e
não imprime códigos.
"""
import argparse
from copy import deepcopy
import json

from . import ac_frames
from .config import dpapi, load_config, save_config
from .import_ir_profiles import ARCHIVE, FANS, MODES
from .ir_codes import code_of, origin_of
from .models import AppError

PROFILE_MODE = {name: number for number, name in MODES.items()}
PROFILE_FAN = {name: number for number, name in FANS.items()}


def pairs_from(schema, profile):
    """(estado, quadro do perfil, gravação) para cada estado completo aprendido que o perfil também tem."""
    out = []
    for key, entry in schema.items():
        if not key.startswith("{") or origin_of(entry) != "aprendido":
            continue
        state = json.loads(key)
        name = f"M{PROFILE_MODE.get(state['mode'])}_T{state['temperature']}_S{PROFILE_FAN.get(state['fan'])}"
        if state["power"] and name in profile:
            out.append((state, profile[name]["code"], code_of(entry)))
    return out


def turbo_pair(schema, pairs):
    """A gravação normal que difere da tecla turbo gravada em um único bit, se houver."""
    entry = schema.get("turbo")
    if not entry or origin_of(entry) != "aprendido":
        return None
    for _state, _profile, recorded in pairs:
        try:
            if len(ac_frames.differences(recorded, code_of(entry))) == 1:
                return recorded, code_of(entry)
        except ValueError:
            continue
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    config = load_config()
    if "ar-quarto" not in config:
        raise SystemExit("O ar não está configurado.")
    schema = config["ar-quarto"]["schema"]
    profile = json.loads(dpapi(ARCHIVE.read_bytes(), decrypt=True))["profiles"]["ar-quarto"]["keys"]
    pairs = pairs_from(schema, profile)
    print("Gravações usadas:", ", ".join(f"{s['temperature']} °C {s['mode']} {s['fan']}" for s, _p, _r in pairs) or "nenhuma")
    turbo = turbo_pair(schema, pairs)
    try:
        calibration = ac_frames.calibrate([(p, r) for _s, p, r in pairs], turbo)
    except ValueError as error:
        raise SystemExit(f"Não calibrado: {error}")
    for state, prof, recorded in pairs:
        if ac_frames.bits(ac_frames.adjust(prof, calibration)) != ac_frames.bits(recorded):
            raise SystemExit("Não calibrado: a correção não reproduz todas as gravações.")
    print("Bits corrigidos:", len(calibration["fix"]), "| turbo:", "calibrado" if "turbo" in calibration else "não gravado")
    if args.apply:
        updated = deepcopy(config)
        updated["ar-quarto"]["frameFix"] = calibration
        save_config(updated)
        print("Calibração salva. Reinicie o servidor do painel.")


if __name__ == "__main__":
    try:
        main()
    except AppError as error:
        raise SystemExit(str(error))
