"""Localização compartilhada pelo app OwnTracks (modo HTTP), recebida só pela tailnet.

O celular dela envia a própria posição para POST /owntracks com usuário e senha (HTTP Basic). Tudo
fica neste PC, protegido por DPAPI: a configuração (senha e lugares) e o histórico das últimas 48 h.
Os lugares (ex.: "Casa", "Ponto") viram regiões no app pelo comando setWaypoints, que vai na resposta
do próximo envio; assim a entrada e a saída chegam na hora exata, sem GPS contínuo.
"""
import base64
from copy import deepcopy
import hmac
import json
import math
from pathlib import Path
import re
import secrets
import subprocess
import threading
import time

from .config import dpapi
from .models import AppError

RETENTION = 48 * 3600
MAX_POINTS = 4000
TRAIL_SECONDS = 6 * 3600
STALE_SECONDS = 30 * 60
MAX_PLACES = 8
ID = re.compile(r"[a-z0-9-]{1,24}")


def distance(a_lat, a_lon, b_lat, b_lon):
    """Metros entre dois pontos (haversine)."""
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(h))


def tailnet_identity():
    """Dono desta máquina na tailnet (só ele vê o painel pelo .ts.net) e o endereço HTTPS dela."""
    try:
        status = json.loads(subprocess.run(["tailscale", "status", "--json"], capture_output=True, text=True, timeout=10,
                                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout)
        owner = status["User"][str(status["Self"]["UserID"])]["LoginName"].lower()
        return owner, "https://" + status["Self"]["DNSName"].rstrip(".").lower()
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        return None, None


def _number(value, low, high):
    return type(value) in (int, float) and not isinstance(value, bool) and math.isfinite(value) and low <= value <= high


def _slug(name):
    base = re.sub(r"[^a-z0-9]+", "-", name.lower().encode("ascii", "ignore").decode()).strip("-")[:20] or "lugar"
    return base


class LocationStore:
    def __init__(self, data_dir, identity=tailnet_identity, clock=time.time):
        self.dir = Path(data_dir)
        self.config_path = self.dir / "localizacao.dpapi"
        self.history_path = self.dir / "localizacao-historico.dpapi"
        self.identity, self.clock = identity, clock
        self.lock = threading.Lock()
        self.config = self._read(self.config_path, None)
        history = self._read(self.history_path, {"points": [], "events": []})
        self.points, self.events = history.get("points", []), history.get("events", [])
        self.failures = []

    # ---- armazenamento ----
    def _read(self, path, default):
        try:
            return json.loads(dpapi(path.read_bytes(), decrypt=True))
        except FileNotFoundError:
            return default
        except Exception:
            return default

    def _write(self, path, value):
        self.dir.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_bytes(dpapi(json.dumps(value, separators=(",", ":")).encode("utf-8")))
        temporary.replace(path)

    def _save_history(self):
        cutoff = self.clock() - RETENTION
        self.points = [p for p in self.points if p["tst"] >= cutoff][-MAX_POINTS:]
        self.events = [e for e in self.events if e["tst"] >= cutoff][-200:]
        self._write(self.history_path, {"points": self.points, "events": self.events})

    @property
    def owner(self):
        return self.config.get("owner") if self.config else None

    # ---- configuração ----
    def setup(self, name):
        """Cria (ou renova) a senha do celular. Devolve a configuração para o app OwnTracks."""
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 30:
            raise AppError("Informe um nome de até 30 caracteres.")
        owner, public_url = self.identity()
        if not owner or not isinstance(public_url, str) or not re.fullmatch(r"https://[a-z0-9.-]+\.ts\.net", public_url):
            raise AppError("Não consegui ler a tailnet deste PC. Confira se o Tailscale está ligado.", 503, "tailscale_unavailable")
        with self.lock:
            owner = (self.config or {}).get("owner") or owner
            config = deepcopy(self.config) if self.config else {"places": []}
            config.update(owner=owner, name=name.strip(), username="celular", password=secrets.token_urlsafe(18), url=public_url, waypointsSent=0)
            self._write(self.config_path, config)
            self.config = config
        return self.phone_config()

    def phone_config(self):
        if not self.config:
            raise AppError("A localização ainda não foi preparada.", 409, "location_unconfigured")
        c = self.config
        initials = "".join(part[0] for part in c["name"].split()[:2]).upper()[:2] or "EU"
        otrc = {"_type": "configuration", "mode": 3, "url": c["url"] + "/owntracks", "auth": True,
                "username": c["username"], "password": c["password"], "deviceId": "iphone", "tid": initials,
                "monitoring": 1, "cmd": True, "allowRemoteLocation": True, "waypoints": self._waypoints()}
        return {"otrc": otrc, "url": otrc["url"], "username": c["username"], "password": c["password"]}

    def _waypoints(self):
        return [{"_type": "waypoint", "desc": p["name"], "lat": p["lat"], "lon": p["lon"], "rad": p["radius"], "tst": p["created"]}
                for p in self.config.get("places", [])]

    def save_place(self, body):
        if not self.config:
            raise AppError("Prepare a localização antes de salvar lugares.", 409, "location_unconfigured")
        if not isinstance(body, dict) or not set(body) <= {"id", "name", "lat", "lon", "radius"}:
            raise AppError("Lugar inválido.")
        name = body.get("name")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 24:
            raise AppError("Dê um nome de até 24 caracteres ao lugar.")
        if not _number(body.get("lat"), -90, 90) or not _number(body.get("lon"), -180, 180) or not _number(body.get("radius"), 30, 1000):
            raise AppError("Posição ou raio fora do permitido (raio de 30 a 1000 m).")
        with self.lock:
            config = deepcopy(self.config)
            places = config["places"]
            existing = next((p for p in places if p["id"] == body.get("id")), None) if body.get("id") else None
            if not existing and len(places) >= MAX_PLACES:
                raise AppError(f"No máximo {MAX_PLACES} lugares.")
            place = existing or {"id": None, "created": int(self.clock())}
            if not existing:
                taken = {p["id"] for p in places}
                base = _slug(name)
                place["id"] = next(c for c in [base, *(f"{base}-{n}" for n in range(2, 99))] if c not in taken)
                places.append(place)
            place.update(name=name.strip(), lat=round(float(body["lat"]), 6), lon=round(float(body["lon"]), 6), radius=int(body["radius"]))
            config["waypointsSent"] = 0  # o próximo envio do celular recebe as regiões novas
            self._write(self.config_path, config)
            self.config = config
        return self.status()

    def remove_place(self, place_id):
        if not self.config or not isinstance(place_id, str) or not ID.fullmatch(place_id):
            raise AppError("Lugar não encontrado.", 404, "not_found")
        with self.lock:
            config = deepcopy(self.config)
            before = len(config["places"])
            config["places"] = [p for p in config["places"] if p["id"] != place_id]
            if len(config["places"]) == before:
                raise AppError("Lugar não encontrado.", 404, "not_found")
            self._write(self.config_path, config)
            self.config = config
        return self.status()

    # ---- recepção do OwnTracks ----
    def authorize(self, header, client):
        """HTTP Basic com comparação em tempo constante; no máximo 10 falhas por minuto."""
        now = self.clock()
        with self.lock:
            self.failures = [t for t in self.failures if now - t < 60]
            if len(self.failures) >= 10:
                raise AppError("Muitas tentativas. Aguarde um minuto.", 429, "rate_limited")
            ok = False
            if self.config and isinstance(header, str) and header.startswith("Basic "):
                try:
                    user, _, password = base64.b64decode(header[6:], validate=True).decode("utf-8").partition(":")
                    ok = hmac.compare_digest(user, self.config["username"]) & hmac.compare_digest(password, self.config["password"])
                except (ValueError, UnicodeError):
                    ok = False
            if not ok:
                self.failures.append(now)
                raise AppError("Usuário ou senha do OwnTracks incorretos.", 401, "unauthorized")

    def ingest(self, body):
        """Guarda posições e transições; devolve o que o app deve receber (regiões pendentes)."""
        kind = body.get("_type") if isinstance(body, dict) else None
        with self.lock:
            if kind == "location":
                point = self._point(body)
                if point:
                    self._track(point)
                    self._save_history()
            elif kind == "transition":
                place = self._place_named(body.get("desc"))
                tst = body.get("tst")
                if place and body.get("event") in {"enter", "leave"} and _number(tst, 1e9, 4e9):
                    self._event(int(tst), "chegou" if body["event"] == "enter" else "saiu", place["id"], exact=True)
                    self._save_history()
            reply = []
            if self.config and self.config.get("places") and not self.config.get("waypointsSent"):
                reply.append({"_type": "cmd", "action": "setWaypoints", "waypoints": {"_type": "waypoints", "waypoints": self._waypoints()}})
                config = deepcopy(self.config)
                config["waypointsSent"] = int(self.clock())
                self._write(self.config_path, config)
                self.config = config
            return reply

    def _point(self, body):
        lat, lon, tst = body.get("lat"), body.get("lon"), body.get("tst")
        if not (_number(lat, -90, 90) and _number(lon, -180, 180) and _number(tst, 1e9, 4e9)):
            return None
        if tst > self.clock() + 300:
            return None
        point = {"lat": round(float(lat), 6), "lon": round(float(lon), 6), "tst": int(tst)}
        for key, low, high in (("acc", 0, 100000), ("batt", 0, 100), ("vel", 0, 1000), ("alt", -1000, 10000)):
            if _number(body.get(key), low, high):
                point[key] = round(body[key])
        if body.get("bs") in (0, 1, 2, 3):
            point["bs"] = body["bs"]  # 1 descarregando, 2 carregando, 3 cheia
        if body.get("conn") in ("w", "m", "o"):
            point["conn"] = body["conn"]
        return point

    def _place_named(self, name):
        return next((p for p in (self.config or {}).get("places", []) if p["name"] == name), None)

    def _inside(self, point):
        for place in (self.config or {}).get("places", []):
            if distance(point["lat"], point["lon"], place["lat"], place["lon"]) <= place["radius"] + min(point.get("acc", 0), 150) / 2:
                return place["id"]
        return None

    def _track(self, point):
        previous = self.points[-1] if self.points else None
        if previous and point["tst"] <= previous["tst"]:
            # Fila antiga reenviada pelo app: guarda no histórico, mas não gera eventos.
            self.points.append(point)
            self.points.sort(key=lambda p: p["tst"])
            return
        before = self._inside(previous) if previous else None
        after = self._inside(point)
        if previous and before != after:
            if before:
                self._event(point["tst"], "saiu", before)
            if after:
                self._event(point["tst"], "chegou", after)
        self.points.append(point)

    def _event(self, tst, kind, place_id, exact=False):
        # A transição do app é exata; a calculada pela posição só entra se não houver uma perto.
        for event in self.events:
            if event["kind"] == kind and event["place"] == place_id and abs(event["tst"] - tst) < 900:
                if exact and not event.get("exact"):
                    event.update(tst=tst, exact=True)
                return
        self.events.append({"tst": tst, "kind": kind, "place": place_id, "exact": exact})
        self.events.sort(key=lambda e: e["tst"])

    # ---- leitura para o painel ----
    def status(self):
        with self.lock:
            if not self.config:
                return {"configured": False}
            now = self.clock()
            places = deepcopy(self.config.get("places", []))
            last = self.points[-1] if self.points else None
            result = {"configured": True, "name": self.config["name"], "now": int(now), "places": places,
                      "regionsPending": bool(places) and not self.config.get("waypointsSent"),
                      "last": deepcopy(last), "trail": [[p["lat"], p["lon"], p["tst"]] for p in self.points if p["tst"] >= now - TRAIL_SECONDS],
                      "events": deepcopy([e for e in self.events if e["tst"] >= now - 24 * 3600])}
            if last:
                inside = self._inside(last)
                result["place"] = inside
                result["stale"] = now - last["tst"] > STALE_SECONDS
                for place in places:
                    place["distance"] = round(distance(last["lat"], last["lon"], place["lat"], place["lon"]))
                if not inside:
                    left = next((e for e in reversed(self.events) if e["kind"] == "saiu"), None)
                    result["leftAt"] = left
            return result
