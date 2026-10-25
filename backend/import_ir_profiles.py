"""Import selected Geonav IR profiles offline; never authenticate or emit IR.

Capture: python -m backend.import_ir_profiles --database <RKStorage snapshot>
Apply:   python -m backend.import_ir_profiles --apply
The scoped archive is protected by this Windows user's DPAPI.
"""
import argparse
from contextlib import closing
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import sqlite3

from .config import DATA_DIR, dpapi, load_config, save_config, validate_code, validate_config
from .adapters import climate_code_key
from .ir_codes import origin_of
from .models import AppError, TV_KEYS
from .site import load_site

def _identity(site=None):
    """Central e controles virtuais da casa, lidos de .data/site.json (fora do Git)."""
    site = site or load_site()
    hub = site["irHub"]["providerId"]
    targets = {logical_id: (item["deviceId"], item["remoteId"], item["brand"], item["category"])
               for logical_id, item in site["irRemotes"].items()}
    return hub, targets


MODES = {0: "cool", 1: "heat", 2: "auto", 3: "fan", 4: "dry"}
FANS = {0: "auto", 1: "low", 2: "medium", 3: "high"}
TV_ALIASES = {"navigate_up": "up", "navigate_down": "down", "navigate_left": "left",
              "navigate_right": "right", "confirm": "ok", "tv/av": "source"}
ARCHIVE = DATA_DIR / "ir-recovery" / "profiles.dpapi"


def convert(head, record):
    """Pure timing conversion. The compact repeat prefix is archived, not replayed."""
    from tinytuya.Contrib.IRRemoteControlDevice import IRRemoteControlDevice as IR
    key = record.get("compressPulse")
    frequency = record.get("frequency")
    if (not isinstance(head, str) or not 18 <= len(head) <= 512
            or not re.fullmatch(r"[0-9a-fA-F]+", head)
            or not isinstance(key, str) or not 4 <= len(key) <= 512
            or type(frequency) is not int or not 37900 <= frequency <= 38100):
        raise ValueError("Unsupported IR encoding or carrier")
    repeat = int(key[:2], 16)
    if not 1 <= repeat <= 4:
        raise ValueError("Unsupported IR repeat prefix")
    pulses = IR.head_key_to_pulses(head, key)
    if (not 4 <= len(pulses) <= 2048 or len(pulses) % 2
            or any(type(p) is not int or not 1 <= p <= 65535 for p in pulses)):
        raise ValueError("Invalid IR pulse train")
    code = IR.pulses_to_base64(pulses)
    validate_code(code)
    return {"code": code, "compressPulse": key, "frequency": frequency,
            "repeatPrefix": repeat, "pulseCount": len(pulses)}


def extract(database, site=None):
    """Read only three allowlisted SQLite entries and retain only two owned profiles."""
    HUB, TARGETS = _identity(site)
    path = Path(database).resolve(strict=True)
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as connection:
        values = {}
        for key in ("remoteSubDevList", "remoteDeviceKeys"):
            row = connection.execute("SELECT value FROM catalystLocalStorage WHERE key=?", (key,)).fetchone()
            if not row:
                raise ValueError("Selected IR profiles are not cached")
            values[key] = json.loads(row[0])
    selected = values["remoteSubDevList"].get(HUB, {})
    metadata = [item for group in selected.values() if isinstance(group, dict)
                for item in group.get("list", []) if isinstance(item, dict)]
    profiles = {}
    for logical_id, (device_id, index, brand, category) in TARGETS.items():
        matches = [item for item in metadata if item.get("devId") == device_id
                   and item.get("gwId") == HUB and item.get("remoteId") == index
                   and item.get("brandName") == brand and item.get("devTypeId") == category]
        if len(matches) != 1:
            raise ValueError("Selected IR profile association is ambiguous")
        source = values["remoteDeviceKeys"].get(device_id, {})
        if (source.get("gwId") != HUB or source.get("remoteId") != index
                or source.get("codeDataType") != 2 or source.get("sendTwoTimes") is not False):
            raise ValueError("Unsupported selected IR profile")
        records = source.get("keyCodes", {})
        if not isinstance(records, dict) or not 1 <= len(records) <= 1000:
            raise ValueError("Invalid IR key collection")
        codes = {}
        for record in records.values():
            name = record.get("key")
            if not isinstance(name, str) or not 1 <= len(name) <= 80 or name in codes:
                raise ValueError("Ambiguous IR key")
            codes[name] = convert(source["remoteCode"], record)
        profiles[logical_id] = {"deviceId": device_id, "remoteId": index, "brand": brand,
                                "head": source["remoteCode"], "keys": codes}
    return {"format": 1, "hubId": HUB, "databaseSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "profiles": profiles}


def schemas(bundle, site=None):
    HUB, TARGETS = _identity(site)
    if bundle.get("format") != 1 or bundle.get("hubId") != HUB:
        raise ValueError("Unknown IR archive")
    result = {}
    for logical_id, (device_id, index, brand, _) in TARGETS.items():
        profile = bundle["profiles"][logical_id]
        if (profile.get("deviceId"), profile.get("remoteId"), profile.get("brand")) != (device_id, index, brand):
            raise ValueError("IR archive association mismatch")
        schema = {}
        for name, record in profile["keys"].items():
            code = record["code"]
            validate_code(code)
            entry = {"code": code, "origem": "geonav-perfil", "validado": False}
            if logical_id == "tv-quarto":
                key = TV_ALIASES.get(name, name)
                if key in TV_KEYS:
                    schema[key] = entry
            elif name == "power_off":
                schema["off"] = entry
            else:
                match = re.fullmatch(r"M([0-4])(?:_T(1[6-9]|2[0-9]|30|--))?_S([0-3])", name)
                if not match:
                    continue
                mode, temp, fan = match.groups()
                # Auto has no temperature in the source profile; each UI temperature
                # deliberately resolves to the same signal rather than inventing one.
                if temp in {None, "--"} and mode != "2":
                    raise ValueError("Unexpected temperature-free IR mode")
                temperatures = range(17, 31) if temp in {None, "--"} else [int(temp)]
                for temperature in temperatures:
                    if 17 <= temperature <= 30:
                        key = climate_code_key({"power": True, "temperature": temperature,
                                                "mode": MODES[int(mode)], "fan": FANS[int(fan)]})
                        schema[key] = entry
        result[logical_id] = schema
    return result


def merge(existing, bundle, site=None):
    HUB, _ = _identity(site)
    updated = deepcopy(existing)
    for logical_id, schema in schemas(bundle, site).items():
        config = updated.get(logical_id, {})
        if config.get("providerId") != HUB or config.get("adapter") != "ir":
            raise ValueError("Provision the known local IR hub before importing profiles")
        current = config["schema"]
        for key, entry in schema.items():
            # Manual learning or physically validated entries always take precedence.
            if key not in current or (origin_of(current[key]) != "aprendido"
                                       and not current[key].get("validado", False)):
                current[key] = entry
    return validate_config(updated)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--database", type=Path)
    group.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        site = load_site()
        if args.database:
            bundle = extract(args.database, site)
            ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
            encrypted = dpapi(json.dumps(bundle).encode())
            temporary = ARCHIVE.with_suffix(".tmp")
            temporary.write_bytes(encrypted)
            temporary.replace(ARCHIVE)
        else:
            bundle = json.loads(dpapi(ARCHIVE.read_bytes(), decrypt=True))
            save_config(merge(load_config(), bundle, site))
        summary = {logical_id: {"sourceKeys": len(bundle["profiles"][logical_id]["keys"]),
                               "mappedEntries": len(schema)} for logical_id, schema in schemas(bundle, site).items()}
        print(json.dumps({"applied": args.apply, "physicalValidation": False, "profiles": summary}))
    except (ValueError, KeyError, TypeError, sqlite3.Error, AppError, OSError):
        parser.exit(1, "Falha ao importar os perfis IR. Nenhum comando foi enviado; confira o cadastro e o arquivo local.\n")


if __name__ == "__main__":
    main()
