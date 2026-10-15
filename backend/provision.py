"""Monta o cadastro de produção (.data/devices.dpapi) a partir dos bundles de recuperação.

Executar no PC que roda o servidor, como o mesmo usuário Windows (o DPAPI é por usuário/máquina):
    .venv\\Scripts\\python.exe -m backend.provision

As chaves só existem decifradas em memória; nada é impresso além de um resumo sem segredos.
Botões IR já aprendidos são preservados; os candidatos Samsung só preenchem teclas ausentes.
"""
import json

from .config import DATA_DIR, dpapi, load_config, save_config
from .ir_codes import samsung_candidates
from .site import load_site
from .tuya_light import DEFAULT_SCHEMA

def _bundle(name):
    data = json.loads(dpapi((DATA_DIR / "key-recovery" / f"{name}.dpapi").read_bytes(), decrypt=True))
    return data["keys"]


def build(existing, site=None):
    # IDs e IPs vêm de .data/site.json (fora do Git); as chaves, dos bundles DPAPI.
    site = site or load_site()
    lights, ir_hub = site["lights"], site["irHub"]
    lamps, hub = _bundle("izy"), _bundle("geonav")
    config = dict(existing)
    for logical_id, info in lights.items():
        config[logical_id] = {**info, "localKey": lamps[info["providerId"]], "adapter": "light", "schema": dict(DEFAULT_SCHEMA)}
    hub_key = hub[ir_hub["providerId"]]
    tv_schema = {**samsung_candidates(), **existing.get("tv-quarto", {}).get("schema", {})}
    ac_schema = dict(existing.get("ar-quarto", {}).get("schema", {}))
    for logical_id, schema in (("tv-quarto", tv_schema), ("ar-quarto", ac_schema)):
        config[logical_id] = {**ir_hub, "localKey": hub_key, "adapter": "ir", "schema": schema}
    return config


def main():
    config = build(load_config())
    save_config(config)
    summary = {logical_id: {"adapter": item["adapter"], "ip": item["ip"], "protocolo": item["protocol"],
                            "botoes": len(item["schema"]) if item["adapter"] == "ir" else None}
               for logical_id, item in config.items()}
    print(json.dumps({"salvo": str(DATA_DIR / "devices.dpapi"), "aparelhos": summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
