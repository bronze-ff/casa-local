"""Gasto estimado do ar sem tomada medidora: horas ligado (pelos comandos enviados) × potência.

O ar não informa o próprio estado (o IR é só ida), então a conta segue o estado estimado pelo
painel: começa a contar quando o painel liga o ar e para quando desliga. Se alguém usar o controle
original, a estimativa erra; por isso a tela sempre chama de "estimado". A potência média e a
tarifa são ajustáveis (padrão: split 9.000 BTU convencional ≈ 0,9 kW, tarifa ≈ R$ 0,95/kWh).
"""
from datetime import datetime, timedelta
import json
from pathlib import Path
import threading
import time

DEFAULTS = {"watts": 900, "tariff": 0.95}
RETENTION_DAYS = 90
MAX_OPEN_HOURS = 16  # sessão esquecida aberta (ex.: desligado pelo controle) não conta além disso


class AcUsage:
    def __init__(self, data_dir, clock=time.time):
        self.path = Path(data_dir) / "ar-uso.json"
        self.clock = clock
        self.lock = threading.Lock()
        try:
            saved = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            saved = {}
        self.config = {**DEFAULTS, **{k: v for k, v in saved.get("config", {}).items() if k in DEFAULTS}}
        self.sessions = [s for s in saved.get("sessions", []) if isinstance(s, list) and len(s) == 2]
        self.open = saved.get("open") if isinstance(saved.get("open"), (int, float)) else None

    def _save(self):
        cutoff = self.clock() - RETENTION_DAYS * 86400
        self.sessions = [s for s in self.sessions if s[1] >= cutoff]
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"config": self.config, "sessions": self.sessions, "open": self.open}), encoding="utf-8")
        temporary.replace(self.path)

    def observe(self, power):
        """Chamado depois de cada comando aceito para o ar, com o estado estimado de ligado."""
        if power is None:
            return
        with self.lock:
            now = self.clock()
            if power and self.open is None:
                self.open = now
            elif not power and self.open is not None:
                self.sessions.append([self.open, min(now, self.open + MAX_OPEN_HOURS * 3600)])
                self.open = None
            else:
                return
            self._save()

    def configure(self, body):
        if not isinstance(body, dict) or not body or not set(body) <= set(DEFAULTS):
            raise ValueError("Informe potência e/ou tarifa.")
        watts, tariff = body.get("watts", self.config["watts"]), body.get("tariff", self.config["tariff"])
        if type(watts) not in (int, float) or not 100 <= watts <= 5000 or type(tariff) not in (int, float) or not 0.1 <= tariff <= 5:
            raise ValueError("Potência entre 100 e 5000 W e tarifa entre R$ 0,10 e R$ 5,00.")
        with self.lock:
            self.config = {"watts": round(watts), "tariff": round(float(tariff), 2)}
            self._save()
        return self.summary()

    def _hours_between(self, start, end):
        total = 0.0
        spans = list(self.sessions)
        if self.open is not None:
            spans.append([self.open, min(self.clock(), self.open + MAX_OPEN_HOURS * 3600)])
        for a, b in spans:
            overlap = min(b, end) - max(a, start)
            if overlap > 0:
                total += overlap
        return total / 3600

    def summary(self):
        with self.lock:
            now = datetime.fromtimestamp(self.clock())
            today = now.replace(hour=0, minute=0, second=0, microsecond=0)
            month = today.replace(day=1)
            kw = self.config["watts"] / 1000
            days = []
            for back in range(6, -1, -1):
                day = today - timedelta(days=back)
                hours = self._hours_between(day.timestamp(), (day + timedelta(days=1)).timestamp())
                days.append({"date": day.strftime("%Y-%m-%d"), "hours": round(hours, 2)})

            def block(start):
                hours = self._hours_between(start.timestamp(), now.timestamp())
                return {"hours": round(hours, 2), "kwh": round(hours * kw, 2), "cost": round(hours * kw * self.config["tariff"], 2)}

            return {"config": dict(self.config), "on": self.open is not None, "onSince": self.open,
                    "today": block(today), "month": block(month), "week": days}
