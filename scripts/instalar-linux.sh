#!/usr/bin/env bash
# Instala a Casa Local no Linux (CachyOS/Arch, systemd). Roda como root no primeiro boot:
#   bash /home/filippe/CasaLocal/scripts/instalar-linux.sh
# Venv e importação dos segredos rodam como filippe; só o serviço do systemd precisa de root.
set -euo pipefail

USUARIO=filippe
PROJETO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SEGREDOS=${CASA_SEGREDOS:-/mnt/d/Migracao-Linux/casalocal-segredos}

if [[ $EUID -ne 0 ]]; then
    echo "Rode como root (sudo bash $0)." >&2
    exit 1
fi
como_usuario() { sudo -u "$USUARIO" -H "$@"; }

# Cópia vinda do Windows pode chegar com outro dono.
chown -R "$USUARIO:$USUARIO" "$PROJETO"
command -v python3 >/dev/null || { echo "python3 ausente (pacman -S python)." >&2; exit 1; }

# Ambiente Python a partir do lock, só se ainda não existir.
if [[ ! -x "$PROJETO/.venv/bin/python" ]]; then
    como_usuario python3 -m venv "$PROJETO/.venv"
fi
como_usuario "$PROJETO/.venv/bin/python" -m pip install --disable-pip-version-check -q -r "$PROJETO/requirements.lock"

# .data só do filippe; os segredos exportados do Windows entram como JSON 0600.
como_usuario mkdir -p "$PROJETO/.data"
chmod 700 "$PROJETO/.data"
if [[ -d "$SEGREDOS" ]]; then
    (cd "$PROJETO" && como_usuario "$PROJETO/.venv/bin/python" -m backend.importar_segredos_linux "$SEGREDOS") \
        || echo "Aviso: algum segredo foi recusado (veja acima); o serviço sobe com os que entraram." >&2
else
    echo "Aviso: $SEGREDOS não encontrado; segredos não importados (rode depois: .venv/bin/python -m backend.importar_segredos_linux PASTA)." >&2
fi
[[ -f "$PROJETO/dist/index.html" ]] || echo "Aviso: dist/ sem build; o painel não abre até rodar npm ci && npm run build." >&2

install -m 644 "$PROJETO/scripts/casalocal.service" /etc/systemd/system/casalocal.service
systemctl daemon-reload
systemctl enable --now casalocal.service
systemctl --no-pager --lines=5 status casalocal.service || true
echo "Casa Local instalada: http://127.0.0.1:8787 (logs: journalctl -u casalocal -f)."
