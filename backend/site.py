"""Identidade física da casa: IDs dos aparelhos, IPs e controles virtuais da central IR.

Esses dados identificam a instalação e ficam só na máquina, em `.data/site.json` (ignorado
pelo Git). O repositório traz `site.example.json` com valores fictícios para servir de modelo.
Somente as ferramentas de instalação (`provision`, `import_ir_profiles`, `heap_local_keys`)
leem este arquivo; o servidor em uso diário usa o cadastro criptografado `devices.dpapi`.
"""
import json
from pathlib import Path

from .config import DATA_DIR, device_ip

SITE_FILE = DATA_DIR / "site.json"
LIGHT_IDS = ("quarto-luz", "banheiro-luz")
REMOTE_IDS = ("ar-quarto", "tv-quarto")


def _text(value, label):
    if not isinstance(value, str) or not 6 <= len(value) <= 64 or not value.replace("_", "").replace("-", "").isalnum():
        raise ValueError(f"site.json: {label} inválido")
    return value


def validate_site(site):
    if not isinstance(site, dict):
        raise ValueError("site.json: formato inválido")
    lights, hub, remotes = site.get("lights"), site.get("irHub"), site.get("irRemotes")
    if not isinstance(lights, dict) or set(lights) != set(LIGHT_IDS):
        raise ValueError("site.json: informe as duas lâmpadas")
    for logical_id, item in lights.items():
        _text(item.get("providerId"), f"{logical_id}.providerId")
        if not device_ip(item.get("ip")) or item.get("protocol") not in {3.1, 3.2, 3.3, 3.4, 3.5}:
            raise ValueError(f"site.json: IP ou protocolo de {logical_id} inválido")
    if not isinstance(hub, dict):
        raise ValueError("site.json: informe a central IR")
    _text(hub.get("providerId"), "irHub.providerId")
    if not device_ip(hub.get("ip")) or hub.get("protocol") not in {3.1, 3.2, 3.3, 3.4, 3.5} or hub.get("controlType") not in {1, 2}:
        raise ValueError("site.json: IP, protocolo ou tipo de controle da central inválido")
    if not isinstance(remotes, dict) or set(remotes) != set(REMOTE_IDS):
        raise ValueError("site.json: informe os controles do ar e da TV")
    for logical_id, item in remotes.items():
        _text(item.get("deviceId"), f"{logical_id}.deviceId")
        if type(item.get("remoteId")) is not int or not isinstance(item.get("brand"), str) or type(item.get("category")) is not int:
            raise ValueError(f"site.json: controle {logical_id} inválido")
    return site


def load_site(path=None):
    path = Path(path) if path else SITE_FILE
    try:
        return validate_site(json.loads(path.read_text(encoding="utf-8")))
    except FileNotFoundError:
        raise ValueError(f"Crie {path} a partir de site.example.json com os dados da sua casa.") from None


def known_devices(site):
    """ID físico → nome lógico, para as ferramentas que precisam reconhecer os aparelhos."""
    known = {item["providerId"]: logical_id for logical_id, item in site["lights"].items()}
    known[site["irHub"]["providerId"]] = "central-ir"
    return known
