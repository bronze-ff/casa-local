"""Lâmpadas Tuya (Izy Intelbras) com schema v2: branco e cor são modos distintos.

DPs comprovados pelo schema recuperado das duas lâmpadas (docs/RETOMADA-CHAVES-LOCAIS.md):
20 switch_led (bool), 21 work_mode (white/colour/scene/music), 22 bright_value 10–1000,
23 temp_value 0–1000 (0 = quente, 1000 = frio), 24 colour_data "hhhhssssvvvv" (h 0–360, s/v 0–1000).

O brilho do painel (1–100 %) vai para o DP22 no modo branco e para o V do DP24 no modo cor;
nunca se infere o brilho da cor a partir do DP22.
"""
import colorsys
import re

DEFAULT_SCHEMA = {"switch": "20", "mode": "21", "bright": "22", "temp": "23", "colour": "24",
                  "brightMin": 10, "brightMax": 1000, "tempMin": 0, "tempMax": 1000}
# Os dois brancos da paleta do painel viram modo branco com temperatura, não cor saturada.
WHITES = {"#FFD6A0": 0, "#FFFFFF": 1000}


def _clamp(value, low, high):
    return max(low, min(high, value))


def parse_colour(raw):
    if not isinstance(raw, str) or not re.fullmatch(r"[0-9a-fA-F]{12}", raw):
        return None
    h, s, v = (int(raw[i:i + 4], 16) for i in (0, 4, 8))
    if h > 360 or s > 1000 or v > 1000:
        return None
    return h, s, v


def format_colour(h, s, v):
    return f"{round(h) % 361:04x}{round(s):04x}{round(v):04x}"


def hex_to_hs(color):
    r, g, b = (int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, s, _ = colorsys.rgb_to_hsv(r, g, b)
    return round(h * 360) % 360, round(s * 1000)


def hs_to_hex(h, s):
    r, g, b = colorsys.hsv_to_rgb(h / 360, s / 1000, 1.0)
    return "#" + "".join(f"{round(x * 255):02X}" for x in (r, g, b))


def percent_to_raw(percent, schema):
    low, high = schema["brightMin"], schema["brightMax"]
    return _clamp(round(percent * high / 100), low, high)


def raw_to_percent(raw, schema):
    return _clamp(round(raw * 100 / schema["brightMax"]), 1, 100)


def decode(dps, schema=DEFAULT_SCHEMA):
    """DPs reportados → estado do painel. Campos sem evidência ficam de fora."""
    state = {}
    power = dps.get(schema["switch"])
    if type(power) is bool:
        state["power"] = power
    mode = dps.get(schema["mode"])
    colour = parse_colour(dps.get(schema["colour"]))
    if mode == "colour" and colour:
        h, s, v = colour
        state["colorHex"] = hs_to_hex(h, s)
        state["brightness"] = raw_to_percent(max(v, schema["brightMin"]), schema)
    elif mode == "white":
        bright = dps.get(schema["bright"])
        if type(bright) is int and schema["brightMin"] <= bright <= schema["brightMax"]:
            state["brightness"] = raw_to_percent(bright, schema)
        temp = dps.get(schema["temp"])
        if type(temp) is int and schema["tempMin"] <= temp <= schema["tempMax"]:
            middle = (schema["tempMin"] + schema["tempMax"]) / 2
            state["colorHex"] = "#FFFFFF" if temp >= middle else "#FFD6A0"
    return state


def encode(values, current_dps, schema=DEFAULT_SCHEMA):
    """Comando do painel → DPs a enviar juntos, considerando o modo atual reportado."""
    payload = {}
    if "power" in values:
        payload[schema["switch"]] = bool(values["power"])
    current = decode(current_dps, schema)
    percent = values.get("brightness", current.get("brightness", 100))
    color = values.get("colorHex")
    if color is not None:
        color = color.upper()
        if color in WHITES:
            payload[schema["mode"]] = "white"
            payload[schema["temp"]] = _clamp(WHITES[color], schema["tempMin"], schema["tempMax"])
            payload[schema["bright"]] = percent_to_raw(percent, schema)
        else:
            h, s = hex_to_hs(color)
            payload[schema["mode"]] = "colour"
            payload[schema["colour"]] = format_colour(h, s, percent_to_raw(percent, schema))
    elif "brightness" in values:
        colour = parse_colour(current_dps.get(schema["colour"]))
        if current_dps.get(schema["mode"]) == "colour" and colour:
            h, s, _ = colour
            payload[schema["colour"]] = format_colour(h, s, percent_to_raw(percent, schema))
        else:
            payload[schema["bright"]] = percent_to_raw(percent, schema)
    return payload


def validate_schema(schema):
    expected = {"switch", "mode", "bright", "temp", "colour", "brightMin", "brightMax", "tempMin", "tempMax"}
    if not isinstance(schema, dict) or set(schema) != expected:
        return False
    dps = [schema[k] for k in ("switch", "mode", "bright", "temp", "colour")]
    if not all(isinstance(dp, str) and re.fullmatch(r"[1-9][0-9]{0,2}", dp) for dp in dps) or len(set(dps)) != 5:
        return False
    bounds = [schema[k] for k in ("brightMin", "brightMax", "tempMin", "tempMax")]
    return all(type(b) is int for b in bounds) and 0 < schema["brightMin"] < schema["brightMax"] <= 10000 and 0 <= schema["tempMin"] < schema["tempMax"] <= 10000
