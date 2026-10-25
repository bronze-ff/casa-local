"""Per-user Windows DPAPI storage. Plaintext keys are never persisted."""
import base64
import ctypes
from ctypes import wintypes
import ipaddress
import json
import os
from pathlib import Path
import re

from .models import INVENTORY, TV_KEYS, AppError

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / ".data"
IDS = {d["id"] for d in INVENTORY}


def private_ip(value):
    try:
        ip = ipaddress.ip_address(value)
    except (ValueError, TypeError):
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    networks = ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10", "fc00::/7")
    return ip.is_loopback or any(ip in ipaddress.ip_network(n) for n in networks)


def device_ip(value):
    return private_ip(value) and not ipaddress.ip_address(value).is_loopback


class Blob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]


def dpapi(data, decrypt=False):
    if os.name != "nt":
        raise AppError("A configuração com chaves exige Windows DPAPI. Nenhum arquivo em texto será criado.", 503, "secure_storage_unavailable")
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    result = Blob()
    crypt = ctypes.WinDLL("crypt32", use_last_error=True)
    function = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    function.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    function.restype = wintypes.BOOL
    if not function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(result)):
        raise AppError("Não foi possível acessar o armazenamento seguro deste usuário Windows.", 503, "secure_storage_unavailable")
    try:
        return ctypes.string_at(result.pbData, result.cbData)
    finally:
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.LocalFree.argtypes = [ctypes.c_void_p]
        kernel.LocalFree(ctypes.cast(result.pbData, ctypes.c_void_p))


def validate_code(value):
    if not isinstance(value, str) or not 4 <= len(value) <= 16000:
        raise AppError("Código IR inválido.")
    try:
        raw = base64.b64decode(value, validate=True)
    except (ValueError, TypeError):
        raise AppError("Código IR deve conter pulsos aprendidos em base64.") from None
    if not raw or len(raw) % 2:
        raise AppError("Código IR deve conter pares de bytes de pulsos aprendidos.")


def validate_config(config):
    if not isinstance(config, dict) or not set(config).issubset(IDS):
        raise AppError("Configuração contém aparelhos desconhecidos.")
    for logical_id, item in config.items():
        if not isinstance(item, dict) or not device_ip(item.get("ip")):
            raise AppError("IP deve ser um endereço literal de rede privada.")
        provider = item.get("providerId")
        key = item.get("localKey")
        if not isinstance(provider, str) or not re.fullmatch(r"[A-Za-z0-9_-]{6,64}", provider):
            raise AppError("Identificador físico inválido.")
        if not isinstance(key, str) or len(key.encode("latin1", errors="replace")) != 16 or not key.isascii():
            raise AppError("A chave local deve ter 16 caracteres ASCII.")
        if item.get("protocol") not in {3.1, 3.2, 3.3, 3.4, 3.5}:
            raise AppError("Versão de protocolo inválida.")
        adapter, schema = item.get("adapter"), item.get("schema")
        # IR pode começar sem botões: eles são aprendidos depois, no controle original.
        if adapter not in {"dp", "ir", "light"} or not isinstance(schema, dict) or (not schema and adapter != "ir"):
            raise AppError("Forneça um esquema explícito comprovado.")
        if adapter == "light":
            from .tuya_light import validate_schema
            if not logical_id.endswith("luz") or not validate_schema(schema):
                raise AppError("Esquema de lâmpada inválido.")
        elif adapter == "dp":
            if logical_id == "tv-quarto":
                raise AppError("A TV exige códigos IR aprendidos.")
            allowed = {"power", "brightness", "colorHex"} if logical_id.endswith("luz") else {"power", "temperature", "mode", "fan"}
            if not set(schema).issubset(allowed):
                raise AppError("Campo DP não permitido.")
            dps = []
            for field, entry in schema.items():
                if not isinstance(entry, dict) or not isinstance(entry.get("dp"), str) or not re.fullmatch(r"[1-9][0-9]{0,2}", entry["dp"]):
                    raise AppError("Cada campo deve declarar seu DP validado.")
                encoding = entry.get("encoding")
                expected = "bool" if field == "power" else "enum" if field in {"mode", "fan"} else "integer" if field in {"brightness", "temperature"} else None
                if (expected and encoding != expected) or (field == "colorHex" and encoding not in {"rgbhex", "hsvhex"}):
                    raise AppError("Codificação DP inválida.")
                if encoding == "integer":
                    low, high = entry.get("min"), entry.get("max")
                    if type(low) is not int or type(high) is not int or not -10000 <= low < high <= 10000:
                        raise AppError("Declare os limites reais do DP numérico.")
                if encoding == "enum":
                    mapping = entry.get("values")
                    valid_keys = {"cool", "heat", "dry", "fan", "auto"} if field == "mode" else {"auto", "low", "medium", "high"}
                    if not isinstance(mapping, dict) or not mapping or not set(mapping).issubset(valid_keys) or any(type(v) not in {str, int} for v in mapping.values()):
                        raise AppError("Declare o mapa de valores reais do DP.")
                dps.append(entry["dp"])
            if len(set(dps)) != len(dps):
                raise AppError("Mapeamento contém DP repetido.")
        else:
            if logical_id.endswith("luz") or item.get("controlType") not in {1, 2}:
                raise AppError("IR exige o tipo de controle 1 ou 2 comprovado.")
            if logical_id == "tv-quarto" and not set(schema).issubset(TV_KEYS):
                raise AppError("Tecla IR desconhecida.")
            for entry in schema.values():
                if isinstance(entry, dict):
                    if set(entry) != {"code", "origem", "validado"} or entry["origem"] not in {"aprendido", "samsung-padrao", "geonav-perfil"} or type(entry["validado"]) is not bool:
                        raise AppError("Entrada IR inválida.")
                    validate_code(entry["code"])
                else:
                    validate_code(entry)
            if "frameFix" in item:
                from .ac_frames import validate as valid_fix
                if logical_id != "ar-quarto" or not valid_fix(item["frameFix"]):
                    raise AppError("Calibração do ar inválida.")
            if logical_id == "ar-quarto":
                from .adapters import climate_code_key
                from .models import AC_EXTRA_KEYS
                for state_key in schema:
                    if state_key == "off" or state_key in AC_EXTRA_KEYS:
                        continue
                    try:
                        state = json.loads(state_key)
                        from .models import validate_command
                        validate_command("climate", {"action": "set", "values": state})
                        if set(state) != {"power", "temperature", "mode", "fan"} or climate_code_key(state) != state_key:
                            raise ValueError
                    except (ValueError, TypeError):
                        raise AppError("Mapa IR do ar exige estado completo canônico.") from None
    return config


def load_config(data_dir=DATA_DIR):
    path = Path(data_dir) / "devices.dpapi"
    if not path.exists():
        return {}
    try:
        return validate_config(json.loads(dpapi(path.read_bytes(), decrypt=True)))
    except AppError:
        raise
    except Exception:
        raise AppError("Arquivo seguro inválido; reconfigure pelo terminal.", 503, "invalid_configuration") from None


def save_config(config, data_dir=DATA_DIR):
    validate_config(config)
    encrypted = dpapi(json.dumps(config).encode("utf-8"))
    directory = Path(data_dir)
    directory.mkdir(parents=True, exist_ok=True)
    temporary = directory / "devices.dpapi.tmp"
    temporary.write_bytes(encrypted)
    temporary.replace(directory / "devices.dpapi")
