"""State and serialized command orchestration."""
from collections import deque
from copy import deepcopy
import json
from pathlib import Path
import secrets
import threading
import time

from . import adapters
from .config import DATA_DIR, load_config, save_config, validate_config
from .ir_codes import climate_summary, origin_of
from .modes import Modes
from .models import AC_EXTRA_KEYS, AppError, INVENTORY, TV_KEYS, VERSION, now, validate_command


class CasaApp:
    def __init__(self, mode="preview", data_dir=DATA_DIR, config=None):
        if mode not in {"preview", "local"}:
            raise ValueError("Invalid mode")
        self.mode, self.data_dir = mode, Path(data_dir)
        # Modos editáveis (antigas cenas); na prévia ficam à parte, em .data/previa.
        self.modes = Modes(self.data_dir if mode == "local" else self.data_dir / "previa")
        self.config = validate_config(config) if config is not None else load_config(self.data_dir) if mode == "local" else {}
        self.csrf_token = secrets.token_urlsafe(32)
        self.lock = threading.RLock()
        self.device_locks = {}
        self.discovery_lock = threading.Lock()
        self.last_discovery = -100.0
        self.recent = deque(maxlen=12)
        # Quem precisa saber de comandos aceitos (ex.: gasto do ar): f(device_id, estado estimado).
        self.listeners = []
        self.stop_event = threading.Event()
        self.poll_thread = None
        self.devices = deepcopy(INVENTORY)
        for device in self.devices:
            configured = device["id"] in self.config
            device.update(configured=configured, connection="preview" if mode == "preview" else "offline" if configured else "unconfigured", confidence="preview" if mode == "preview" else "unknown", updatedAt=None)
            if mode == "local":
                device["state"] = {field: None for field in device["state"]}
            # TV + climate sharing an IR hub must serialize against the physical ID.
            physical_id = self.config.get(device["id"], {}).get("providerId", device["id"])
            self.device_locks[device["id"]] = self.device_locks.get(physical_id, threading.Lock())
            self.device_locks[physical_id] = self.device_locks[device["id"]]
        if mode == "preview":
            self._restore_preview()

    def start_polling(self):
        if self.mode != "local" or self.poll_thread is not None:
            return
        self.poll_thread = threading.Thread(target=self._poll, daemon=True, name="casa-configured-poll")
        self.poll_thread.start()

    def close(self):
        self.stop_event.set()

    def _poll(self):
        while not self.stop_event.is_set():
            for device in self.devices:
                device_id = device["id"]
                if self.stop_event.is_set():
                    return
                if device_id not in self.config or not self.device_locks[device_id].acquire(blocking=False):
                    continue
                try:
                    state = adapters.read(self.config[device_id])
                    with self.lock:
                        device["state"].update(state)
                        device["connection"] = "online"
                        if state:
                            device["confidence"], device["updatedAt"] = "reported", now()
                except Exception:
                    with self.lock:
                        device["connection"] = "offline"
                finally:
                    self.device_locks[device_id].release()
            self.stop_event.wait(10)

    def _restore_preview(self):
        try:
            saved = json.loads((self.data_dir / "preview-state.json").read_text(encoding="utf-8"))
            for device in self.devices:
                values = saved.get(device["id"])
                if not values:
                    continue
                if device["kind"] == "tv":
                    if isinstance(values, dict) and set(values) == {"power", "volume", "source", "muted"} and type(values["power"]) is bool and type(values["muted"]) is bool and type(values["volume"]) is int and 0 <= values["volume"] <= 100 and values["source"] in {"HDMI 1", "HDMI 2", "TV"}:
                        device["state"].update(values)
                    continue
                validate_command(device["kind"], {"action": "set", "values": values})
                device["state"].update(values)
        except (OSError, ValueError, AppError, AttributeError):
            pass

    def _climate_summary(self, schema):
        # O cadastro só muda no aprendizado/importação (troca do objeto), então a identidade basta.
        cached = getattr(self, "_climate_cache", None)
        if cached is None or cached[0] is not schema or cached[1] != len(schema):
            cached = (schema, len(schema), climate_summary(schema))
            self._climate_cache = cached
        return deepcopy(cached[2])

    def snapshot(self, bootstrap=False):
        with self.lock:
            result = {"mode": self.mode, "devices": deepcopy(self.devices), "scenes": self.modes.public(), "recentActions": list(self.recent), "hub": {"name": "Casa Local", "connection": "preview" if self.mode == "preview" else "local", "status": "preview" if self.mode == "preview" else "ready", "message": "Prévia: nenhum comando físico" if self.mode == "preview" else "Servidor privado · configuração pelo terminal", "configuredCount": len(self.config), "version": VERSION}}
            for device in result["devices"]:
                item = self.config.get(device["id"])
                if item and item["adapter"] == "ir":
                    # Só origens e cobertura; os códigos nunca saem do servidor.
                    if device["kind"] == "climate":
                        # O ar tem ~280 estados: um resumo evita ~27 KB a cada consulta de 5 s.
                        device["irClimate"] = {**self._climate_summary(item["schema"]), "turbo": "turbo" in item.get("frameFix", {}), "calibrated": bool(item.get("frameFix"))}
                    else:
                        device["irKeys"] = {key: origin_of(entry) for key, entry in item["schema"].items()}
            if bootstrap:
                result["csrfToken"] = self.csrf_token
            return result

    def command(self, device_id, body, origin=None):
        with self.lock:
            device = next((d for d in self.devices if d["id"] == device_id), None)
            if device is None:
                raise AppError("Aparelho não encontrado.", 404, "not_found")
            command = validate_command(device["kind"], body)
        with self.device_locks[device_id]:
            if self.mode == "local" and device_id not in self.config:
                raise AppError("Configure este aparelho pelo terminal antes de enviar comandos reais.", 409, "device_unconfigured")
            try:
                if self.mode == "preview":
                    values = command.get("values", {})
                    if command["action"] == "key":
                        key = command["key"]
                        if key == "power":
                            values = {"power": not device["state"]["power"]}
                        elif key in {"volume_up", "volume_down"}:
                            values = {"volume": max(0, min(100, device["state"]["volume"] + (1 if key == "volume_up" else -1)))}
                        elif key == "mute":
                            values = {"muted": not device["state"]["muted"]}
                        elif key == "source":
                            sources = ["HDMI 1", "HDMI 2", "TV"]
                            values = {"source": sources[(sources.index(device["state"]["source"]) + 1) % len(sources)]}
                    result = {"status": "preview", "confidence": "preview", "state": values, "message": "Simulado na prévia. Nenhum comando físico enviado."}
                else:
                    result = adapters.send(self.config[device_id], command, deepcopy(device["state"]))
                with self.lock:
                    device["state"].update(result["state"])
                    device.update(connection="preview" if self.mode == "preview" else "online", confidence=result["confidence"], updatedAt=now())
                    message = f"{origin}: {result['message']}" if origin else result["message"]
                    self.recent.appendleft({"id": secrets.token_hex(6), "deviceId": device_id, "name": device["name"], "message": message, "status": result["status"], "createdAt": now()})
                    state = deepcopy(device["state"])
                    if self.mode == "preview":
                        self.data_dir.mkdir(parents=True, exist_ok=True)
                        temporary = self.data_dir / "preview-state.json.tmp"
                        temporary.write_text(json.dumps({d["id"]: d["state"] for d in self.devices}), encoding="utf-8")
                        temporary.replace(self.data_dir / "preview-state.json")
                for listener in self.listeners:
                    try:
                        listener(device_id, state)
                    except Exception:
                        pass
                return {"state": self.snapshot(), "device": deepcopy(device), "command": {k: v for k, v in result.items() if k != "state"}}
            except AppError as error:
                with self.lock:
                    if error.code == "device_unavailable":
                        device["connection"] = "offline"
                    self.recent.appendleft({"id": secrets.token_hex(6), "deviceId": device_id, "name": device["name"], "message": str(error), "status": "failed", "createdAt": now()})
                raise

    def learn(self, device_id, body):
        """Grava um botão do controle original pela central IR e salva no cadastro DPAPI."""
        if self.mode != "local":
            raise AppError("Aprender botões só funciona no modo local, no PC de casa.", 409, "preview_mode")
        item = self.config.get(device_id)
        if not item or item["adapter"] != "ir":
            raise AppError("Este aparelho não usa a central infravermelha.", 409, "device_unconfigured")
        if not isinstance(body, dict) or len(body) != 1:
            raise AppError("Informe o botão ou o estado a aprender.")
        if device_id == "tv-quarto":
            key = body.get("key")
            if key not in TV_KEYS:
                raise AppError("Tecla desconhecida.")
            label = key
        elif body.get("key") == "off":
            key, label = "off", "desligar"
        elif body.get("key") in AC_EXTRA_KEYS:
            key = body["key"]
            label = {"turbo": "turbo", "eco": "eco", "brisa": "brisa", "display": "display"}[key]
        else:
            state = body.get("state")
            command = validate_command("climate", {"action": "set", "values": state})
            if set(command["values"]) != {"power", "temperature", "mode", "fan"} or command["values"]["power"] is not True:
                raise AppError("Informe o estado completo ligado: temperatura, modo e ventilação.")
            key = adapters.climate_code_key(command["values"])
            label = f"{state['temperature']} °C · {state['mode']} · {state['fan']}"
        device = next(d for d in self.devices if d["id"] == device_id)
        with self.device_locks[device_id]:
            code = adapters.learn(item)
            with self.lock:
                updated = deepcopy(self.config)
                updated[device_id]["schema"][key] = {"code": code, "origem": "aprendido", "validado": False}
                save_config(updated, self.data_dir)
                self.config = updated
                self.recent.appendleft({"id": secrets.token_hex(6), "deviceId": device_id, "name": device["name"], "message": f"Botão aprendido: {label}. Teste olhando o aparelho.", "status": "learned", "createdAt": now()})
        return {"state": self.snapshot(), "learned": key if device_id == "tv-quarto" or key == "off" or key in AC_EXTRA_KEYS else label}

    def scene(self, scene_id):
        """Aplica um modo: luzes primeiro, o ar por último. O ar com "manter se ligado" não é tocado
        quando o painel sabe que ele já está ligado (ex.: ligado pelo celular antes de chegar)."""
        mode = self.modes.get(scene_id)
        results = []
        for device_id, step in sorted(mode["steps"].items(), key=lambda item: item[0] == "ar-quarto"):
            values = {k: v for k, v in step.items() if k != "keepIfOn"}
            if step.get("keepIfOn"):
                with self.lock:
                    device = next((d for d in self.devices if d["id"] == device_id), None)
                    already = device is not None and device["state"].get("power") is True
                if already:
                    results.append({"deviceId": device_id, "status": "skipped", "message": "Já estava ligado; mantido como está."})
                    continue
            try:
                result = self.command(device_id, {"action": "set", "values": values}, origin=f"Modo {mode['name']}")
                results.append({"deviceId": device_id, **result["command"]})
            except AppError as error:
                results.append({"deviceId": device_id, "status": "failed", "code": error.code, "message": str(error)})
        return {"state": self.snapshot(), "results": results, "status": "partial" if any(r["status"] == "failed" for r in results) else "preview" if self.mode == "preview" else "completed"}

    def discovery(self):
        if self.mode == "preview":
            return {"mode": "preview", "devices": [], "message": "Descoberta desativada na prévia. Nenhum pacote foi enviado."}
        if not self.discovery_lock.acquire(blocking=False):
            raise AppError("Uma descoberta já está em andamento.", 429, "busy")
        try:
            if time.monotonic() - self.last_discovery < 20:
                raise AppError("Aguarde antes de repetir a descoberta.", 429, "rate_limited")
            self.last_discovery = time.monotonic()
            return {"mode": self.mode, "devices": adapters.discover(self.config), "message": "Somente aparelhos previamente configurados são exibidos."}
        finally:
            self.discovery_lock.release()
