"""Importa no Linux os segredos exportados (já decifrados) do Windows para .data, com permissão 0600.

O export espelha .data trocando .dpapi por .json:
    casalocal-segredos/devices.json          -> .data/devices.dpapi
    casalocal-segredos/key-recovery/izy.json -> .data/key-recovery/izy.dpapi
No Linux os .dpapi guardam o JSON puro (veja backend/config.py), então basta copiar. Cada arquivo é
validado como JSON antes de gravar; nenhum valor é impresso, só os caminhos.

    .venv/bin/python -m backend.importar_segredos_linux [/mnt/d/Migracao-Linux/casalocal-segredos]
"""
import json
import os
from pathlib import Path
import sys

from .config import DATA_DIR

SOURCE = Path("/mnt/d/Migracao-Linux/casalocal-segredos")


def importar(source=SOURCE, data_dir=DATA_DIR):
    """Copia cada .json válido; devolve (importados, recusados) como listas de caminhos relativos."""
    source, data_dir = Path(source), Path(data_dir)
    data_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    data_dir.chmod(0o700)
    done, refused = [], []
    for path in sorted(source.rglob("*.json")):
        relative = path.relative_to(source).with_suffix(".dpapi")
        raw = path.read_bytes()
        try:
            json.loads(raw.decode("utf-8-sig"))
        except ValueError:
            refused.append(str(relative))
            continue
        target = data_dir / relative
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        temporary = target.with_name(target.name + ".tmp")
        # Nasce 0600 (O_CREAT com modo explícito), não depende da umask de quem rodou.
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(raw.decode("utf-8-sig").encode("utf-8"))
        os.chmod(temporary, 0o600)
        temporary.replace(target)
        done.append(str(relative))
    return done, refused


def main():
    if os.name == "nt":
        raise SystemExit("Só para o Linux: no Windows os segredos ficam no DPAPI.")
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else SOURCE
    if not source.is_dir():
        raise SystemExit(f"Pasta do export não encontrada: {source}")
    done, refused = importar(source)
    for item in done:
        print(f"importado: .data/{item}")
    for item in refused:
        print(f"recusado (não é JSON válido): {item}")
    print(f"{len(done)} importado(s), {len(refused)} recusado(s).")
    raise SystemExit(1 if refused else 0)


if __name__ == "__main__":
    main()
