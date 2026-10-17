"""Chave dos Atalhos da Siri: "E aí Siri, cheguei" roda um modo sem abrir o painel.

O atalho manda `Authorization: Bearer <chave>` no lugar do token da sessão do painel, e só nas
rotas de ação (modos, aparelhos, modo jogo). Continua valendo o resto da proteção: rede privada
e, pelo Tailscale, só o dono. A chave fica em .data/atalhos.json e pode ser trocada no painel.
"""
import hmac
import json
from pathlib import Path
import re
import secrets
import threading

ALLOWED = (re.compile(r"/api/scenes/[a-z0-9-]{1,24}/run"), re.compile(r"/api/devices/[a-z-]+/commands"), re.compile(r"/api/homelab"))


class Shortcuts:
    def __init__(self, data_dir):
        self.path = Path(data_dir) / "atalhos.json"
        self.lock = threading.Lock()
        try:
            self.key = json.loads(self.path.read_text(encoding="utf-8"))["key"]
            if not isinstance(self.key, str) or len(self.key) < 32:
                raise ValueError
        except (OSError, ValueError, KeyError, TypeError):
            self.key = None

    def _write(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"key": self.key}), encoding="utf-8")
        temporary.replace(self.path)

    def status(self):
        with self.lock:
            if self.key is None:
                self.key = secrets.token_urlsafe(32)
                self._write()
            return {"key": self.key}

    def rotate(self):
        with self.lock:
            self.key = secrets.token_urlsafe(32)
            self._write()
        return self.status()

    def allows(self, path, headers):
        """Pedido de atalho válido para esta rota?"""
        if not any(pattern.fullmatch(path) for pattern in ALLOWED):
            return False
        values = headers.get_all("Authorization", []) or []
        if len(values) != 1 or not values[0].startswith("Bearer "):
            return False
        with self.lock:
            return self.key is not None and hmac.compare_digest(values[0][7:].strip(), self.key)
