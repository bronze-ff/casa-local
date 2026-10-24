"""Localização compartilhada pelo app OwnTracks (modo HTTP), recebida só pela tailnet.

Até 4 pessoas, cada uma com o próprio celular e login (HTTP Basic) em POST /owntracks. Os lugares
(ex.: "Casa", "Academia") são os mesmos para todos e viram regiões no app pelo comando setWaypoints,
que vai na resposta do próximo envio de cada celular; assim a entrada e a saída chegam na hora exata,
sem GPS contínuo. Tudo fica neste PC, protegido por DPAPI: a configuração (senhas e lugares) e o
histórico das últimas 48 h de cada pessoa.

Presença da casa: alguém está num lugar chamado "Casa" → em casa; todos com posição e fora → vazia;
sem dado de alguém → não se sabe. Usada pelo modo ausente e pelo Frigate "fora de casa".
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
import unicodedata

from .config import dpapi
from .models import AppError

RETENTION = 48 * 3600
MAX_POINTS = 4000
TRAIL_SECONDS = 6 * 3600
STALE_SECONDS = 30 * 60
MAX_PLACES = 8
MAX_PEOPLE = 4
HOME_NAMES = {"casa", "home", "minha casa", "casa local"}
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


def _slug(name, fallback="lugar"):
    plain = unicodedata.normalize("NFKD", name.lower()).encode("ascii", "ignore").decode()  # "João" → "joao"
    base = re.sub(r"[^a-z0-9]+", "-", plain).strip("-")[:20] or fallback
    return base


def _name(value, limit):
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= limit:
        raise AppError(f"Informe um nome de até {limit} caracteres.")
    return value.strip()


class LocationStore:
    def __init__(self, data_dir, identity=tailnet_identity, clock=time.time):
        self.dir = Path(data_dir)
        self.config_path = self.dir / "localizacao.dpapi"
        self.history_path = self.dir / "localizacao-historico.dpapi"
        self.identity, self.clock = identity, clock
        self.lock = threading.Lock()
        self.config = self._read(self.config_path, None)
        history = self._read(self.history_path, {})
        self.tracks = history.get("people", {}) if isinstance(history.get("people"), dict) else {}
        self._migrate(history)
        self.failures = []
        # Quem reage a chegadas/saídas novas (rotinas de lugar, avisos): f({"tst", "kind", "place", "person", "name"}).
        self.listeners = []

    def _migrate(self, history):
        """Arquivos da versão de uma pessoa só: a pessoa vira a primeira da lista, com o mesmo login."""
        if self.config and "people" not in self.config:
            person = {"id": _slug(self.config.get("name", "pessoa"), "pessoa"), "name": self.config.get("name", "Pessoa"),
                      "username": self.config.get("username", "celular"), "password": self.config.get("password", ""),
                      "waypointsSent": self.config.get("waypointsSent", 0)}
            self.config = {"owner": self.config.get("owner"), "url": self.config.get("url"), "places": self.config.get("places", []),
                           "people": [person] if person["password"] else []}
            self._write(self.config_path, self.config)
            if "points" in history:
                self.tracks = {person["id"]: {"points": history.get("points", []), "events": history.get("events", [])}}
                self._save_history()

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
        for track in self.tracks.values():
            track["points"] = [p for p in track["points"] if p["tst"] >= cutoff][-MAX_POINTS:]
            track["events"] = [e for e in track["events"] if e["tst"] >= cutoff][-200:]
        self._write(self.history_path, {"people": self.tracks})

    def _track(self, person_id):
        return self.tracks.setdefault(person_id, {"points": [], "events": []})

    def _person(self, person_id):
        person = next((p for p in (self.config or {}).get("people", []) if p["id"] == person_id), None)
        if person is None:
            raise AppError("Pessoa não encontrada.", 404, "not_found")
        return person

    @property
    def owner(self):
        return self.config.get("owner") if self.config else None

    @property
    def points(self):
        """Pontos de todas as pessoas (compatibilidade e testes)."""
        return [p for track in self.tracks.values() for p in track["points"]]

    # ---- pessoas ----
    def setup(self, name, person=None):
        """Sem `person`: cadastra uma pessoa nova. Com `person`: gera senha nova para ela (o celular lê o QR de novo).
        Devolve a configuração para o app OwnTracks."""
        name = _name(name, 30)
        owner, public_url = self.identity()
        valid_url = isinstance(public_url, str) and re.fullmatch(r"https://[a-z0-9.-]+\.ts\.net", public_url)
        if not self.config and (not owner or not valid_url):
            raise AppError("Não consegui ler a tailnet deste PC. Confira se o Tailscale está ligado.", 503, "tailscale_unavailable")
        with self.lock:
            config = deepcopy(self.config) if self.config else {"owner": owner, "url": public_url, "places": [], "people": []}
            if valid_url:
                config["url"] = public_url
            people = config.setdefault("people", [])
            if person is None:
                if len(people) >= MAX_PEOPLE:
                    raise AppError(f"No máximo {MAX_PEOPLE} pessoas.")
                taken = {p["id"] for p in people}
                base = _slug(name, "pessoa")
                person_id = next(c for c in [base, *(f"{base}-{n}" for n in range(2, 99))] if c not in taken)
                people.append({"id": person_id, "name": name, "username": f"celular-{person_id}", "password": secrets.token_urlsafe(18), "waypointsSent": 0})
            else:
                person_id = person
                entry = next((p for p in people if p["id"] == person_id), None)
                if entry is None:
                    raise AppError("Pessoa não encontrada.", 404, "not_found")
                entry.update(name=name, password=secrets.token_urlsafe(18), waypointsSent=0)
            self._write(self.config_path, config)
            self.config = config
        return self.phone_config(person_id)

    def rename(self, person_id, name):
        name = _name(name, 30)
        with self.lock:
            config = deepcopy(self.config or {})
            entry = next((p for p in config.get("people", []) if p["id"] == person_id), None)
            if entry is None:
                raise AppError("Pessoa não encontrada.", 404, "not_found")
            entry["name"] = name
            self._write(self.config_path, config)
            self.config = config
        return self.status()

    def remove_person(self, person_id):
        with self.lock:
            config = deepcopy(self.config or {})
            before = len(config.get("people", []))
            config["people"] = [p for p in config.get("people", []) if p["id"] != person_id]
            if len(config["people"]) == before:
                raise AppError("Pessoa não encontrada.", 404, "not_found")
            self._write(self.config_path, config)
            self.config = config
            self.tracks.pop(person_id, None)
            self._save_history()
        return self.status()

    def phone_config(self, person_id=None):
        if not self.config or not self.config.get("people"):
            raise AppError("A localização ainda não foi preparada.", 409, "location_unconfigured")
        if person_id is None and len(self.config["people"]) == 1:
            person_id = self.config["people"][0]["id"]
        person = self._person(person_id)
        initials = "".join(part[0] for part in person["name"].split()[:2]).upper()[:2] or "EU"
        otrc = {"_type": "configuration", "mode": 3, "url": self.config["url"] + "/owntracks", "auth": True,
                "username": person["username"], "password": person["password"], "deviceId": "iphone", "tid": initials,
                "monitoring": 1, "cmd": True, "allowRemoteLocation": True, "waypoints": self._waypoints()}
        return {"person": person["id"], "otrc": otrc, "url": otrc["url"], "username": person["username"], "password": person["password"]}

    # ---- lugares ----
    def _waypoints(self):
        return [{"_type": "waypoint", "desc": p["name"], "lat": p["lat"], "lon": p["lon"], "rad": p["radius"], "tst": p["created"]}
                for p in self.config.get("places", [])]

    @staticmethod
    def _resend_regions(config):
        for person in config.get("people", []):
            person["waypointsSent"] = 0  # o próximo envio de cada celular recebe as regiões novas

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
            self._resend_regions(config)
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
            self._resend_regions(config)
            self._write(self.config_path, config)
            self.config = config
        return self.status()

    # ---- recepção do OwnTracks ----
    def authorize(self, header, client):
        """HTTP Basic com comparação em tempo constante; no máximo 10 falhas por minuto. Devolve o id da pessoa."""
        now = self.clock()
        with self.lock:
            self.failures = [t for t in self.failures if now - t < 60]
            if len(self.failures) >= 10:
                raise AppError("Muitas tentativas. Aguarde um minuto.", 429, "rate_limited")
            found = None
            if self.config and isinstance(header, str) and header.startswith("Basic "):
                try:
                    user, _, password = base64.b64decode(header[6:], validate=True).decode("utf-8").partition(":")
                    for person in self.config.get("people", []):
                        if hmac.compare_digest(user, person["username"]) & hmac.compare_digest(password, person["password"]):
                            found = person["id"]
                except (ValueError, UnicodeError):
                    found = None
            if not found:
                self.failures.append(now)
                raise AppError("Usuário ou senha do OwnTracks incorretos.", 401, "unauthorized")
            return found

    def ingest(self, body, person_id=None):
        """Guarda posições e transições de uma pessoa; devolve o que o app dela deve receber (regiões pendentes)."""
        if person_id is None and self.config and len(self.config.get("people", [])) == 1:
            person_id = self.config["people"][0]["id"]
        kind = body.get("_type") if isinstance(body, dict) else None
        with self.lock:
            person = next((p for p in (self.config or {}).get("people", []) if p["id"] == person_id), None)
            if person is None:
                return []
            if kind == "location":
                point = self._point(body)
                if point:
                    self._add_point(person, point)
                    self._save_history()
            elif kind == "transition":
                place = self._place_named(body.get("desc"))
                tst = body.get("tst")
                if place and body.get("event") in {"enter", "leave"} and _number(tst, 1e9, 4e9):
                    self._event(person, int(tst), "chegou" if body["event"] == "enter" else "saiu", place["id"], exact=True)
                    self._save_history()
            reply = []
            if self.config.get("places") and not person.get("waypointsSent"):
                reply.append({"_type": "cmd", "action": "setWaypoints", "waypoints": {"_type": "waypoints", "waypoints": self._waypoints()}})
                config = deepcopy(self.config)
                next(p for p in config["people"] if p["id"] == person["id"])["waypointsSent"] = int(self.clock())
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

    def _add_point(self, person, point):
        track = self._track(person["id"])
        previous = track["points"][-1] if track["points"] else None
        if previous and point["tst"] <= previous["tst"]:
            # Fila antiga reenviada pelo app: guarda no histórico, mas não gera eventos.
            track["points"].append(point)
            track["points"].sort(key=lambda p: p["tst"])
            return
        before = self._inside(previous) if previous else None
        after = self._inside(point)
        if previous and before != after:
            if before:
                self._event(person, point["tst"], "saiu", before)
            if after:
                self._event(person, point["tst"], "chegou", after)
        track["points"].append(point)

    def _event(self, person, tst, kind, place_id, exact=False):
        # A transição do app é exata; a calculada pela posição só entra se não houver uma perto.
        events = self._track(person["id"])["events"]
        for event in events:
            if event["kind"] == kind and event["place"] == place_id and abs(event["tst"] - tst) < 900:
                if exact and not event.get("exact"):
                    event.update(tst=tst, exact=True)
                return
        events.append({"tst": tst, "kind": kind, "place": place_id, "exact": exact})
        events.sort(key=lambda e: e["tst"])
        for listener in self.listeners:
            try:
                listener({"tst": tst, "kind": kind, "place": place_id, "person": person["id"], "name": person["name"]})
            except Exception:
                pass

    # ---- leitura para o painel ----
    def _recent(self, tst, now):
        return type(tst) in (int, float) and not isinstance(tst, bool) and now - STALE_SECONDS <= tst <= now + 300

    def _at_home(self, person_id, homes, now):
        """True em casa, False fora, None sem sinal recente. A cerca (enter/leave de um lugar Casa)
        mais nova que o GPS vale na hora: o app avisa a saída antes de mandar outra posição."""
        track = self.tracks.get(person_id, {})
        points = track.get("points", [])
        last = points[-1] if points else None
        state, at = None, None
        if last is not None and self._recent(last["tst"], now):
            state, at = self._inside(last) in homes, last["tst"]
        for event in track.get("events", []):
            tst = event.get("tst")
            if event.get("place") not in homes or event.get("kind") not in {"chegou", "saiu"}:
                continue
            if not self._recent(tst, now) or (at is not None and tst < at):
                continue
            state, at = event["kind"] == "chegou", tst
        return state

    def presence(self):
        """True: alguém num lugar "Casa". False: todos com dado recente e fora.
        None: sem lugar Casa, ou sem dado recente de alguém. Ponto ou transição com mais de
        30 min não conta: o painel já marca esse ponto como parado, e aqui a casa fica "não se sabe"."""
        with self.lock:
            if not self.config:
                return None
            homes = {p["id"] for p in self.config.get("places", []) if p["name"].strip().casefold() in HOME_NAMES}
            people = self.config.get("people", [])
            if not homes or not people:
                return None
            now = self.clock()
            states = [self._at_home(person["id"], homes, now) for person in people]
            if any(state is True for state in states):
                return True
            return False if all(state is False for state in states) else None

    def status(self):
        with self.lock:
            if not self.config:
                return {"configured": False}
            now = self.clock()
            places = deepcopy(self.config.get("places", []))
            people, events = [], []
            for person in self.config.get("people", []):
                track = self.tracks.get(person["id"], {"points": [], "events": []})
                last = track["points"][-1] if track["points"] else None
                entry = {"id": person["id"], "name": person["name"], "last": deepcopy(last),
                         "regionsPending": bool(places) and not person.get("waypointsSent"),
                         "trail": [[p["lat"], p["lon"], p["tst"]] for p in track["points"] if p["tst"] >= now - TRAIL_SECONDS]}
                if last:
                    inside = self._inside(last)
                    entry.update(place=inside, stale=now - last["tst"] > STALE_SECONDS,
                                 distances={p["id"]: round(distance(last["lat"], last["lon"], p["lat"], p["lon"])) for p in places})
                    if not inside:
                        entry["leftAt"] = deepcopy(next((e for e in reversed(track["events"]) if e["kind"] == "saiu"), None))
                people.append(entry)
                events.extend({**e, "person": person["id"], "name": person["name"]} for e in track["events"] if e["tst"] >= now - 24 * 3600)
            events.sort(key=lambda e: e["tst"])
            return {"configured": True, "now": int(now), "places": places, "people": people, "events": events}
