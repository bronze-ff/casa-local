"""Ajustes bit a bit nos quadros IR do ar, calibrados a partir de gravações do controle original.

O perfil Geonav do ar tem os estados completos, mas o controle original da casa envia alguns bits
fixos diferentes e liga o turbo por um bit próprio. Comparando gravações do controle (modo Aprender)
com os quadros do perfil para o mesmo estado, a calibração descobre:

- fix: bits que o controle original sempre envia com outro valor (aplicados a todo quadro do perfil);
- turbo: o bit que liga o turbo (diferença entre gravar o mesmo estado sem e com turbo).

Só se aceita uma calibração consistente: a mesma diferença em todas as gravações comparadas e um
único bit entre o estado normal e o turbo. Bits são endereçados como (segmento, índice), onde o
segmento é cada bloco do quadro separado por uma pausa longa.
"""
import base64
import statistics
import struct

GAP = 4000      # µs: espaço que separa os segmentos do quadro
ONE = 1000      # µs: espaço acima disto é bit 1


def _pulses(code):
    raw = base64.b64decode(code)
    return list(struct.unpack(f"<{len(raw) // 2}H", raw))


def _code(pulses):
    return base64.b64encode(struct.pack(f"<{len(pulses)}H", *pulses)).decode("ascii")


def bit_spaces(pulses):
    """Índices (na lista de pulsos) do espaço de cada bit, por segmento. Pula o cabeçalho e o
    espaço final, que é só a pausa depois do último pulso (o perfil usa 1 ms; o controle, ~50 ms)."""
    segments, current = [], []
    for index in range(3, len(pulses) - 1, 2):
        if pulses[index] >= GAP:
            segments.append(current)
            current = []
        else:
            current.append(index)
    if current:
        segments.append(current)
    return segments


def bits(code):
    pulses = _pulses(code)
    return [[1 if pulses[i] > ONE else 0 for i in segment] for segment in bit_spaces(pulses)]


def apply(code, changes):
    """Devolve o código com os bits (seg, i) ajustados; mantém as durações do próprio quadro."""
    if not changes:
        return code
    pulses = _pulses(code)
    segments = bit_spaces(pulses)
    spaces = [pulses[i] for segment in segments for i in segment]
    short = round(statistics.median([s for s in spaces if s <= ONE] or [560]))
    long = round(statistics.median([s for s in spaces if s > ONE] or [1690]))
    for segment, index, value in changes:
        if segment >= len(segments) or index >= len(segments[segment]):
            raise ValueError("Bit fora do quadro")
        pulses[segments[segment][index]] = long if value else short
    return _code(pulses)


def differences(reference, recorded):
    """Bits em que a gravação difere da referência, só nas posições presentes nas duas."""
    a, b = bits(reference), bits(recorded)
    if len(a) != len(b):
        raise ValueError("Quadros com estrutura diferente")
    out = []
    for segment, (x, y) in enumerate(zip(a, b)):
        for index in range(min(len(x), len(y))):
            if x[index] != y[index]:
                out.append((segment, index, y[index]))
    return out


def calibrate(pairs, turbo_pair=None):
    """pairs: [(quadro do perfil, gravação do controle)] do mesmo estado. turbo_pair: (normal, turbo)."""
    if len(pairs) < 2:
        raise ValueError("Grave pelo menos dois estados diferentes para calibrar")
    found = [sorted(differences(profile, recorded)) for profile, recorded in pairs]
    if any(diff != found[0] for diff in found):
        raise ValueError("As gravações não mostram uma diferença consistente com o perfil")
    calibration = {"fix": [list(item) for item in found[0]]}
    if turbo_pair:
        turbo = differences(*turbo_pair)
        if len(turbo) != 1 or turbo[0][2] != 1:
            raise ValueError("O turbo deve diferir do estado normal em exatamente um bit")
        calibration["turbo"] = list(turbo[0][:2])
    return calibration


def adjust(code, calibration, turbo=False):
    """Quadro final para enviar: aplica a calibração e, se pedido, o bit do turbo."""
    if not calibration:
        return code
    changes = [tuple(item) for item in calibration.get("fix", [])]
    if "turbo" in calibration:
        segment, index = calibration["turbo"]
        changes.append((segment, index, 1 if turbo else 0))
    return apply(code, changes)


def validate(calibration):
    if not isinstance(calibration, dict) or not set(calibration) <= {"fix", "turbo"}:
        return False
    fix = calibration.get("fix", [])
    if not isinstance(fix, list) or len(fix) > 16:
        return False
    for item in fix:
        if not (isinstance(item, list) and len(item) == 3 and all(type(v) is int for v in item)
                and 0 <= item[0] < 4 and 0 <= item[1] < 64 and item[2] in (0, 1)):
            return False
    turbo = calibration.get("turbo")
    return turbo is None or (isinstance(turbo, list) and len(turbo) == 2 and all(type(v) is int and 0 <= v < 64 for v in turbo))
