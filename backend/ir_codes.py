"""Códigos IR: formatos aceitos pela central Geonav e candidatos públicos da TV Samsung.

Central Geonav (TinyTuya "control_type 2", DPs 1–13): um código aprendido é a lista de pulsos
em microssegundos (uint16 little-endian) em base64, enviado com DP1="study_key" + DP7.

Os códigos Samsung abaixo são os valores públicos do protocolo Samsung32 (os mesmos usados
por LIRC/IRremote para TVs Samsung). Ficam marcados como "samsung-padrao", sem validação
física: só o proprietário olhando a TV comprova. Um botão aprendido no controle original
substitui o candidato.
"""
import base64
import json
import struct

SAMSUNG_TV = {
    "power": 0xE0E040BF,       # alterna; nunca é repetido automaticamente
    "volume_up": 0xE0E0E01F,
    "volume_down": 0xE0E0D02F,
    "mute": 0xE0E0F00F,
    "up": 0xE0E006F9,
    "down": 0xE0E08679,
    "left": 0xE0E0A659,
    "right": 0xE0E046B9,
    "ok": 0xE0E016E9,
    "home": 0xE0E09E61,        # Smart Hub / Home
    "back": 0xE0E01AE5,        # Return
    "source": 0xE0E0807F,
}


def samsung32_pulses(value):
    """Cabeçalho 4500/4500 µs, 32 bits MSB primeiro (560 µs marca; 560/1690 µs espaço), marca final."""
    pulses = [4500, 4500]
    for bit in range(31, -1, -1):
        pulses += [560, 1690 if value >> bit & 1 else 560]
    pulses.append(560)
    return pulses


def pulses_to_base64(pulses):
    return base64.b64encode(struct.pack(f"<{len(pulses)}H", *pulses)).decode("ascii")


def samsung_candidates():
    return {key: {"code": pulses_to_base64(samsung32_pulses(value)), "origem": "samsung-padrao", "validado": False}
            for key, value in SAMSUNG_TV.items()}


def code_of(entry):
    """Entrada do cadastro → base64 de pulsos (aceita o formato antigo, só a string)."""
    return entry["code"] if isinstance(entry, dict) else entry


def origin_of(entry):
    return entry.get("origem", "aprendido") if isinstance(entry, dict) else "aprendido"


def climate_summary(schema):
    """Resumo do cadastro do ar para o painel, sem códigos e sem as 281 chaves completas.

    coverage: modo → ventilação → temperaturas com sinal cadastrado.
    templess: pares "modo/ventilação" em que todas as temperaturas usam o mesmo sinal, ou seja,
    o controle não envia temperatura (caso do automático no perfil Electrolux). Calculado pelos
    próprios códigos, então também vale para sinais aprendidos manualmente.
    """
    coverage, codes, origins, extras = {}, {}, {}, {}
    for key, entry in schema.items():
        origins[origin_of(entry)] = origins.get(origin_of(entry), 0) + 1
        if key == "off":
            continue
        if not key.startswith("{"):
            extras[key] = origin_of(entry)
            continue
        try:
            state = json.loads(key)
            mode, fan, temperature = state["mode"], state["fan"], state["temperature"]
        except (ValueError, TypeError, KeyError):
            continue
        coverage.setdefault(mode, {}).setdefault(fan, []).append(temperature)
        codes.setdefault((mode, fan), set()).add(code_of(entry))
    for fans in coverage.values():
        for temperatures in fans.values():
            temperatures.sort()
    templess = sorted(f"{mode}/{fan}" for (mode, fan), distinct in codes.items()
                      if len(distinct) == 1 and len(coverage[mode][fan]) > 1)
    return {"off": origin_of(schema["off"]) if "off" in schema else None, "origins": origins,
            "coverage": coverage, "templess": templess, "extras": extras}
