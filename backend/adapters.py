"""TinyTuya transport with explicit schemas; no cloud, guesses, or IR retries."""
import colorsys
import json
import logging
import multiprocessing
import socket
import time

from . import ac_frames, tuya_light
from .ir_codes import code_of, origin_of
from .models import (AC_STATE_FIELDS, AppError, command_context, command_receipt,
                     ensure_command_time, now)


MODE_PT = {"cool": "resfriar", "heat": "aquecer", "dry": "desumidificar", "fan": "ventilar", "auto": "automático"}
FAN_PT = {"auto": "automática", "low": "baixa", "medium": "média", "high": "alta"}


def _requested_dps(config):
    """DPs explicitamente cadastrados; nunca a varredura automática do TinyTuya."""
    schema = config["schema"]
    if config["adapter"] == "light":
        return {schema[k]: None for k in ("switch", "mode", "bright", "temp", "colour")}
    return {entry["dp"]: None for entry in schema.values()}


def climate_code_key(state):
    return json.dumps({k: state[k] for k in AC_STATE_FIELDS if k in state}, sort_keys=True, separators=(",", ":"))


def encode_dp(field, value, spec):
    encoding = spec["encoding"]
    if encoding == "bool":
        return value
    if encoding == "integer":
        lo, hi = (0, 100) if field == "brightness" else (17, 30)
        return round(spec["min"] + (value - lo) * (spec["max"] - spec["min"]) / (hi - lo))
    if encoding == "enum":
        if value not in spec["values"]:
            raise AppError("Este ajuste não possui valor DP configurado.", 409, "unsupported_command")
        return spec["values"][value]
    if encoding == "rgbhex":
        return value.lstrip("#").lower()
    rgb = tuple(int(value[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, s, v = colorsys.rgb_to_hsv(*rgb)
    return f"{round(h * 360):04x}{round(s * 1000):04x}{round(v * 1000):04x}"


def decode_dp(field, raw, spec):
    encoding = spec["encoding"]
    if encoding == "bool":
        if type(raw) is not bool:
            raise ValueError
        return raw
    if encoding == "integer":
        if type(raw) not in {int, float} or not spec["min"] <= raw <= spec["max"]:
            raise ValueError
        lo, hi = (0, 100) if field == "brightness" else (17, 30)
        return round(lo + (raw - spec["min"]) * (hi - lo) / (spec["max"] - spec["min"]))
    if encoding == "enum":
        return next(k for k, v in spec["values"].items() if v == raw and type(v) is type(raw))
    if encoding == "rgbhex":
        if not isinstance(raw, str) or len(raw) != 6:
            raise ValueError
        int(raw, 16)
        return "#" + raw.upper()
    if not isinstance(raw, str) or len(raw) != 12:
        raise ValueError
    h, s, v = (int(raw[i:i + 4], 16) for i in (0, 4, 8))
    if h > 360 or s > 1000 or v > 1000:
        raise ValueError
    rgb = colorsys.hsv_to_rgb(h / 360, s / 1000, v / 1000)
    return "#" + "".join(f"{round(x * 255):02X}" for x in rgb)


_IR_PROBES = {}  # providerId -> monotonic time of the last authenticated answer


def probe_ir(config, max_age=60):
    """Consulta de estado autenticada da central IR, sem enviar comando.

    Comprovado em 15/10/2026: a central Geonav (protocolo 3.3) responde à consulta DP_QUERY com
    o texto "json obj data unvalid" cifrado com a chave local — ela não guarda estado, mas a
    resposta só decifra com a chave certa. Isso valida chave e transporte sem emitir IR.
    """
    import time
    logging.getLogger("tinytuya").disabled = True
    if time.monotonic() - _IR_PROBES.get(config["providerId"], -1e9) < max_age:
        return True
    import tinytuya
    device = tinytuya.Device(config["providerId"], config["ip"], config["localKey"], version=config["protocol"], connection_timeout=2, connection_retry_limit=1, connection_retry_delay=0)  # o limite conta tentativas: 0 não conecta
    device.set_socketTimeout(3)
    device.set_retry(False)
    try:
        message = device._send_receive(device.generate_payload(tinytuya.DP_QUERY), getresponse=True, decode_response=False)
        raw = getattr(message, "payload", None)
        if not raw:
            raise AppError("Central IR sem resposta.", 502, "device_unavailable")
        plain = tinytuya.AESCipher(config["localKey"].encode()).decrypt(raw, use_base64=False, decode_text=False)
        if b"json obj data unvalid" not in plain and b'"dps"' not in plain:
            raise AppError("Central IR respondeu de forma inesperada.", 502, "device_unavailable")
        _IR_PROBES[config["providerId"]] = time.monotonic()
        return True
    except AppError:
        raise
    except Exception:
        raise AppError("Central IR sem resposta.", 502, "device_unavailable") from None
    finally:
        device.close()


def learn(config, timeout=25):
    """Modo aprender da central (DP1 study → DP2 study_code → DP1 study_exit). Não emite IR.

    O proprietário aponta o controle original para a central e aperta o botão dentro do prazo.
    Devolve os pulsos em base64, no formato aceito pelo envio (DP1 study_key + DP7).
    """
    logging.getLogger("tinytuya").disabled = True
    from tinytuya.Contrib.IRRemoteControlDevice import IRRemoteControlDevice
    from .config import validate_code

    device = IRRemoteControlDevice(config["providerId"], config["ip"], config["localKey"], version=config["protocol"], control_type=config["controlType"], connection_timeout=3, connection_retry_limit=1, persist=True)
    device.set_retry(False)
    try:
        code = device.receive_button(timeout=timeout)
    except Exception:
        raise AppError("Falha na conexão com a central durante o aprendizado.", 502, "device_unavailable") from None
    finally:
        try:
            device.study_end()
        except Exception:
            pass
        device.close()
    if not isinstance(code, str) or not code:
        raise AppError("Nenhum sinal recebido. Aponte o controle para a central, bem perto, e tente de novo.", 408, "learn_timeout")
    validate_code(code)
    return code


def read(config):
    """Poll only an explicitly configured address; IR means authenticated emitter reachability."""
    if config["adapter"] == "ir":
        probe_ir(config)
        return {}
    logging.getLogger("tinytuya").disabled = True
    import tinytuya
    class SchemaOnlyDevice(tinytuya.Device):
        def detect_available_dps(self):
            # Protocol 3.2 invokes this during construction. Use only configured
            # DPs, rather than TinyTuya's automatic query over guessed DP IDs.
            self.dps_to_request = _requested_dps(config)
            return self.dps_to_request

        def _get_socket(self, renew):
            previous = self.socketRetryLimit
            self.socketRetryLimit = 1
            try:
                return super()._get_socket(renew)
            finally:
                self.socketRetryLimit = previous

    device = SchemaOnlyDevice(config["providerId"], config["ip"], config["localKey"], version=config["protocol"], connection_timeout=2, connection_retry_limit=0, connection_retry_delay=0)
    device.disabledetect = True
    device.set_retry(False)
    try:
        reply = device.status()
        if not isinstance(reply, dict) or not isinstance(reply.get("dps"), dict):
            raise AppError("Aparelho indisponível.", 502, "device_unavailable")
        if config["adapter"] == "light":
            return tuya_light.decode(reply["dps"], config["schema"])
        state = {}
        for field, spec in config["schema"].items():
            if spec["dp"] in reply["dps"]:
                try:
                    state[field] = decode_dp(field, reply["dps"][spec["dp"]], spec)
                except (ValueError, TypeError, StopIteration):
                    pass
        return state
    finally:
        device.close()


def send(config, command, current, *, context=None):
    context = context or command_context()
    requested = command.get("values", {})
    expected = requested
    emitted = False
    delivery = "not_sent"
    reported = {}
    observed_at = None
    # Disable library diagnostics: they can include encrypted payloads and local keys.
    logging.getLogger("tinytuya").disabled = True
    try:
        import tinytuya
    except ImportError:
        raise AppError("TinyTuya não está instalado no ambiente local.", 503, "adapter_unavailable") from None
    common = dict(dev_id=config["providerId"], address=config["ip"], local_key=config["localKey"], version=config["protocol"], connection_timeout=2, connection_retry_limit=0, connection_retry_delay=0, persist=False)
    def remaining_timeout(device):
        ensure_command_time(context)
        device.set_socketTimeout(min(2.0, context.deadline - time.monotonic()))

    class SingleAttempt:
        def detect_available_dps(self):
            if config["adapter"] in {"dp", "light"}:
                self.dps_to_request = _requested_dps(config)
            else:
                self.dps_to_request = {"201" if config["controlType"] == 1 else "1": None}
            return self.dps_to_request

        def _get_socket(self, renew):
            remaining_timeout(self)
            previous = self.socketRetryLimit
            self.socketRetryLimit = 1
            try:
                result = super()._get_socket(renew)
            finally:
                self.socketRetryLimit = previous
            # Connecting/negotiating may consume the budget before the SDK sends.
            remaining_timeout(self)
            return result

    def receipt():
        value = command_receipt(context, requested, delivery=delivery, reported=reported, expected=expected)
        value["observedAt"] = observed_at
        return value

    def uncertain():
        return AppError("Resultado físico incerto; confira o estado antes de repetir.", 502,
                        "command_result_unknown", receipt=receipt())

    device = None
    try:
        ensure_command_time(context)
        if config["adapter"] == "ir":
            from tinytuya.Contrib.IRRemoteControlDevice import IRRemoteControlDevice

            class CheckedIR(SingleAttempt, IRRemoteControlDevice):
                """Contrib discards its send result; capture it without changing framing."""
                send_result = None

                def set_value(self, *args, **kwargs):
                    self.send_result = super().set_value(*args, **kwargs)
                    return self.send_result

                def set_multiple_values(self, *args, **kwargs):
                    self.send_result = super().set_multiple_values(*args, **kwargs)
                    return self.send_result

            if command["action"] == "key":
                key, estimated = command["key"], {}
            else:
                estimated = {**current, **command["values"]}
                if estimated.get("power") is False:
                    estimated["turbo"] = False
                if estimated.get("turbo") and "turbo" not in config.get("frameFix", {}):
                    raise AppError("O turbo ainda não foi calibrado. Grave o mesmo estado com e sem turbo e rode a calibração.", 409, "ir_not_learned")
                # Desligar costuma ser o mesmo sinal em qualquer estado: usa o código "off" quando aprendido.
                key = "off" if estimated.get("power") is False and "off" in config["schema"] else climate_code_key(estimated)
            entry = config["schema"].get(key)
            if not entry:
                if command["action"] == "key":
                    raise AppError("Esta tecla não tem código cadastrado. Use Aprender e aponte o controle original para a central.", 409, "ir_not_learned")
                if key == climate_code_key(estimated) and estimated.get("power") is False:
                    raise AppError("O desligar não está cadastrado. Use Aprender › Gravar desligar.", 409, "ir_not_learned")
                mode, fan = MODE_PT.get(estimated.get("mode"), "?"), FAN_PT.get(estimated.get("fan"), "?")
                raise AppError(f"O estado {estimated.get('temperature')} °C · {mode} · ventilação {fan} não está cadastrado. Use Aprender para gravá-lo.", 409, "ir_not_learned")
            if command["action"] == "set" and set(command["values"]) == {"temperature"} and current.get("power") is True:
                previous = config["schema"].get(climate_code_key(current))
                # No automático o perfil usa o mesmo sinal para todas as temperaturas: reenviar
                # não muda nada no aparelho e só faria o ar apitar.
                if previous and code_of(previous) == code_of(entry):
                    raise AppError("Neste modo o controle não envia temperatura; o próprio ar decide. Nada foi enviado.", 409, "temperature_not_encoded")
            # control_type avoids automatic detection, which itself emits study commands.
            device = CheckedIR(**common, control_type=config["controlType"])
            device.set_retry(False)
            code = code_of(entry)
            if config.get("frameFix") and key.startswith("{"):
                # Quadros do perfil viram os do controle original; o turbo é um bit sobre o estado.
                code = ac_frames.adjust(code, config["frameFix"], bool(estimated.get("turbo")))
            elif config.get("frameFix") and key == "off" and origin_of(entry) != "aprendido":
                # O desligar do perfil tem os mesmos bits fixos errados. Se não tiver o formato do
                # ar (outro tipo de quadro), vai como está.
                try:
                    code = ac_frames.adjust(code, config["frameFix"])
                except ValueError:
                    pass
            remaining_timeout(device)
            emitted, delivery = True, "unknown"
            device.send_button(code)
            reply = device.send_result
            if isinstance(reply, dict) and ("Error" in reply or "Err" in reply):
                raise uncertain()
            if isinstance(reply, dict):
                delivery = "sent"
            return {"status": "sent", "confidence": "estimated" if command["action"] == "set" else "unknown",
                    "state": estimated, "receipt": receipt(),
                    "message": "Sinal/tentativa aceita; estado físico não confirmado."}
        schema = config["schema"]
        values = command["values"]
        if config["adapter"] != "light" and not set(values).issubset(schema):
            raise AppError("Este ajuste não possui DP configurado.", 409, "unsupported_command")

        class CheckedDP(SingleAttempt, tinytuya.Device):
            def set_multiple_values(self, values, nowait=False):
                # Device.set_multiple_values retries/splits multi-DP errors even
                # when transport retries are disabled. Emit one SDK frame only.
                payload = self.generate_payload(tinytuya.CONTROL, {str(key): value for key, value in values.items()})
                return self._send_receive(payload, getresponse=not nowait)

        device = CheckedDP(**common)
        device.disabledetect = True
        device.set_retry(False)
        before_dps = {}
        if config["adapter"] == "light":
            if set(values) != {"power"}:
                remaining_timeout(device)
                before = device.status()
                if not isinstance(before, dict) or not isinstance(before.get("dps"), dict) or "Error" in before or "Err" in before:
                    raise AppError("Lâmpada indisponível. Nenhum comando enviado.", 502, "device_unavailable")
                before_dps = before["dps"]
            payload = tuya_light.encode(values, before_dps, schema)
            expected = tuya_light.normalized_values(values, before_dps, schema)
        else:
            payload = {schema[field]["dp"]: encode_dp(field, value, schema[field]) for field, value in values.items()}
            expected = {field: decode_dp(field, payload[schema[field]["dp"]], schema[field]) for field in values}

        remaining_timeout(device)
        # Conservative boundary: entering the SDK may already have emitted bytes.
        emitted, delivery = True, "unknown"
        reply = device.set_multiple_values(payload, nowait=False)
        if isinstance(reply, dict) and ("Error" in reply or "Err" in reply):
            raise uncertain()
        if isinstance(reply, dict):
            delivery = "sent"
        remaining_timeout(device)
        status = device.status()
        if isinstance(status, dict) and isinstance(status.get("dps"), dict):
            if config["adapter"] == "light":
                reported = tuya_light.decode(status["dps"], schema)
            else:
                for field, spec in schema.items():
                    if spec["dp"] in status["dps"]:
                        try:
                            reported[field] = decode_dp(field, status["dps"][spec["dp"]], spec)
                        except (ValueError, TypeError, StopIteration):
                            pass
            if reported:
                observed_at = now()
        if not isinstance(status, dict) or not isinstance(status.get("dps"), dict) or "Error" in status or "Err" in status:
            raise uncertain()
        value = receipt()
        return {"status": "acknowledged" if delivery == "sent" else "sent",
                "confidence": "reported" if reported else "unknown", "state": reported,
                "receipt": value,
                "message": "Estado observado após a tentativa; confira a evidência por campo."}
    except AppError as error:
        if emitted:
            if error.code == "command_result_unknown":
                raise
            raise uncertain() from None
        if error.receipt is None:
            error.receipt = receipt()
        raise
    except Exception:
        if emitted:
            raise uncertain() from None
        raise AppError("Falha na conexão local. Nenhum comando enviado.", 502,
                       "device_unavailable", receipt=receipt()) from None
    finally:
        if device is not None:
            device.close()


def _discover(config):
    """Listen to LAN announcements only; return allowlisted known devices only."""
    logging.getLogger("tinytuya").disabled = True
    try:
        import tinytuya
        from tinytuya.scanner import devices as scan_devices
        # Nonempty sentinel prevents loading any ambient devices.json secrets.
        found = scan_devices(verbose=False, scantime=10, color=False, poll=False, forcescan=False, show_timer=False, tuyadevices=[{"id": "__casa_no_ambient_files__", "name": "", "key": ""}])
        known = {item["providerId"]: logical_id for logical_id, item in config.items()}
        result = []
        from .config import device_ip
        for item in found.values():
            if not isinstance(item, dict) or item.get("gwId") not in known or not device_ip(item.get("ip")):
                continue
            version = str(item.get("version", ""))
            result.append({"id": known[item["gwId"]], "ip": item["ip"], "protocol": version if version in {"3.1", "3.2", "3.3", "3.4", "3.5"} else "unknown"})
        return result
    except Exception:
        raise AppError("Descoberta local indisponível. Nenhuma configuração foi alterada.", 503, "discovery_unavailable") from None


def _discovery_worker(config, connection):
    try:
        connection.send({"devices": _discover(config)})
    except Exception:
        connection.send({"error": True})
    finally:
        connection.close()


def discover(config):
    # A separate process gives the scanner a hard wall-clock ceiling, including
    # library initialization. No detached scans survive a timed-out request.
    context = multiprocessing.get_context("spawn")
    receiver, sender = context.Pipe(duplex=False)
    worker = context.Process(target=_discovery_worker, args=(config, sender), daemon=True)
    worker.start()
    sender.close()
    try:
        if not receiver.poll(14):
            raise AppError("Descoberta encerrada após o limite de tempo.", 504, "discovery_timeout")
        result = receiver.recv()
        if "error" in result:
            raise AppError("Descoberta local indisponível.", 503, "discovery_unavailable")
        return result["devices"]
    finally:
        if worker.is_alive():
            worker.terminate()
        worker.join(timeout=0.5)
        receiver.close()
