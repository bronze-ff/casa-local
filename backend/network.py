"""Aparelhos na rede de casa: varredura leve e aviso de aparelho novo.

A cada 15 min o PC de casa manda um ping para cada endereço da rede local (sem varrer portas) e lê a
tabela de vizinhos do Windows (IP, MAC e o nome que o roteador anuncia). Nas primeiras 24 h a Casa só
aprende a rede (celulares dormindo aparecem aos poucos), sem avisos; depois, cada MAC nunca visto vira
um aviso no celular (tópico do sistema).
Na aba Lab dá para dar nome aos aparelhos e marcar os novos como conhecidos. Tudo fica em
.data/rede.json, só neste PC.

Aparelhos vigiados (por padrão os que a Casa usa: roteador, DVR, central infravermelha, lâmpadas)
avisam quando somem por duas varreduras seguidas (~30 min) e quando voltam.

MAC "privado" (bit de endereço local ligado) é o que celulares usam por rede Wi-Fi: o mesmo celular
mantém o mesmo endereço nesta rede, mas não dá para saber o fabricante por ele.
"""
from copy import deepcopy
import json
from pathlib import Path
import re
import threading
import time

from .homelab import run
from .models import AppError

SCAN_EVERY = 900
MAX_DEVICES = 300
LEARN_SECONDS = 86400  # primeiras 24 h: aprende a rede em silêncio (celulares em repouso aparecem aos poucos)
MISSES_TO_ALERT = 2  # varreduras seguidas sem resposta antes de avisar que um aparelho vigiado sumiu
MAC = re.compile(r"[0-9a-f]{12}")
IPV4 = re.compile(r"(?:\d{1,3}\.){3}\d{1,3}")

# Ping assíncrono para toda a /24 da placa com gateway (preenche a tabela de vizinhos) e leitura dela;
# nomes por DNS reverso com prazo curto. Sai em JSON: {"gateway": ip, "devices": [{ip, mac, host}]}.
SCRIPT = r"""
$ErrorActionPreference = 'SilentlyContinue'
$cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
if (-not $cfg) { '{"gateway":null,"devices":[]}'; exit }
$ip = $cfg.IPv4Address.IPAddress; $prefix = ($ip -split '\.')[0..2] -join '.'
$pings = 1..254 | ForEach-Object { [System.Net.NetworkInformation.Ping]::new().SendPingAsync("$prefix.$_", 700) }
[void][System.Threading.Tasks.Task]::WaitAll($pings, 12000)
Start-Sleep -Milliseconds 800
$neighbors = Get-NetNeighbor -AddressFamily IPv4 -InterfaceIndex $cfg.InterfaceIndex | Where-Object { $_.IPAddress -like "$prefix.*" -and $_.State -in 'Reachable','Stale','Delay','Probe','Permanent' -and $_.LinkLayerAddress -match '^[0-9A-F]{2}(-[0-9A-F]{2}){5}$' -and $_.LinkLayerAddress -notmatch '^(FF-){5}FF$|^00(-00){5}$|^01-00-5E' }
$self = (Get-NetAdapter -InterfaceIndex $cfg.InterfaceIndex).MacAddress
$lookups = @{}
foreach ($n in $neighbors) { $lookups[$n.IPAddress] = [System.Net.Dns]::GetHostEntryAsync($n.IPAddress) }
try { [void][System.Threading.Tasks.Task]::WaitAll(@($lookups.Values), 8000) } catch { }
$list = @([pscustomobject]@{ ip = $ip; mac = $self; host = $env:COMPUTERNAME })
foreach ($n in $neighbors) {
  $t = $lookups[$n.IPAddress]; $name = if ($t.IsCompleted -and -not $t.IsFaulted) { $t.Result.HostName } else { '' }
  $list += [pscustomobject]@{ ip = $n.IPAddress; mac = $n.LinkLayerAddress; host = $name }
}
[pscustomobject]@{ gateway = $cfg.IPv4DefaultGateway.NextHop; devices = $list } | ConvertTo-Json -Depth 3 -Compress
"""


def scan_windows():
    """Varredura do Windows; devolve {"gateway", "devices"} ou None se falhar."""
    code, out = run(["powershell", "-NoProfile", "-NonInteractive", "-Command", SCRIPT], timeout=90)
    if code != 0:
        return None
    try:
        return json.loads(out.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return None


def _mac(value):
    clean = re.sub(r"[^0-9a-f]", "", str(value).lower())
    return clean if MAC.fullmatch(clean) else None


def _host(value, ip):
    """Nome anunciado, sem o domínio da rede; o próprio IP como nome não conta."""
    name = str(value or "").strip().split(".")[0][:40]
    return None if not name or IPV4.fullmatch(str(value or "").strip()) or name == ip.split(".")[0] else name


def _label(value):
    return value.strip()[:40] if isinstance(value, str) and value.strip() else None


class Network:
    def __init__(self, data_dir, scanner=scan_windows, hints=lambda: {}, notify=lambda device: None, presence=lambda device, online: None, clock=time.time):
        """hints(): {ip: nome} dos aparelhos que a Casa já conhece; notify(device): aparelho novo;
        presence(device, online): aparelho vigiado sumiu (False) ou voltou (True)."""
        self.path = Path(data_dir) / "rede.json"
        self.scanner, self.hints, self.notify, self.presence, self.clock = scanner, hints, notify, presence, clock
        self.misses, self.down = {}, set()
        self.lock = threading.Lock()
        self.busy = threading.Lock()
        self.online, self.scanned, self.error, self.gateway = set(), None, None, None
        try:
            saved = json.loads(self.path.read_text(encoding="utf-8"))
            self.devices = {k: v for k, v in saved.get("devices", {}).items() if MAC.fullmatch(k) and isinstance(v, dict)}
            self.baseline = saved.get("baseline") is True
            learn = saved.get("learnUntil")
            if type(learn) is not int and self.baseline:  # arquivo de antes do aprendizado: conta da 1ª varredura
                learn = min((d.get("firstSeen") or 0 for d in self.devices.values()), default=0) + LEARN_SECONDS
            self.learn_until = learn if type(learn) is int else None
            # Última varredura sobrevive a um reinício do painel (senão tudo apareceria desligado).
            self.scanned = saved.get("scanned") if type(saved.get("scanned")) is int else None
            self.online = {m for m in saved.get("online", []) if isinstance(m, str) and m in self.devices}
        except (OSError, ValueError, AttributeError):
            self.devices, self.baseline, self.learn_until = {}, False, None

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"baseline": self.baseline, "learnUntil": self.learn_until, "scanned": self.scanned, "online": sorted(self.online),
                                         "devices": self.devices}, ensure_ascii=False), encoding="utf-8")
        temporary.replace(self.path)

    def scan(self):
        """Uma varredura. Devolve a lista de aparelhos novos (já avisados)."""
        if not self.busy.acquire(blocking=False):
            raise AppError("Já estou varrendo a rede; espere um instante.", 409, "busy")
        try:
            result = self.scanner()
            now = int(self.clock())
            if not isinstance(result, dict) or not isinstance(result.get("devices"), list):
                with self.lock:
                    self.error = "A varredura não respondeu."
                return []
            fresh, seen = [], set()
            with self.lock:
                if self.learn_until is None:
                    self.learn_until = now + LEARN_SECONDS
                learning = now < self.learn_until
                for item in result["devices"]:
                    mac = _mac(item.get("mac")) if isinstance(item, dict) else None
                    ip = str(item.get("ip", "")) if mac else ""
                    if not mac or not IPV4.fullmatch(ip) or mac in seen:
                        continue
                    seen.add(mac)
                    device = self.devices.get(mac)
                    if device is None:
                        if len(self.devices) >= MAX_DEVICES:
                            oldest = min(self.devices, key=lambda k: self.devices[k].get("lastSeen", 0))
                            del self.devices[oldest]
                        device = self.devices[mac] = {"ip": ip, "host": None, "name": None, "firstSeen": now, "known": learning}
                        if not learning:
                            fresh.append(mac)
                    device["ip"], device["lastSeen"] = ip, now
                    device["host"] = _host(item.get("host"), ip) or device.get("host")
                self.online, self.scanned, self.error = seen, now, None
                self.gateway = result.get("gateway") if IPV4.fullmatch(str(result.get("gateway") or "")) else None
                self.baseline = True
                self._save()
                hints = self.hints()
                new = [self._view(mac, hints) for mac in fresh]
                changes = []
                for mac in self.devices:
                    view = self._view(mac, hints)
                    if not view["watched"]:
                        continue
                    if mac in seen:
                        self.misses.pop(mac, None)
                        if mac in self.down:
                            self.down.discard(mac)
                            changes.append((view, True))
                    else:
                        self.misses[mac] = self.misses.get(mac, 0) + 1
                        if self.misses[mac] == MISSES_TO_ALERT and mac not in self.down:
                            self.down.add(mac)
                            changes.append((view, False))
            for device in new:
                self.notify(device)
            for device, online in changes:
                self.presence(device, online)
            return new
        finally:
            self.busy.release()

    def _view(self, mac, hints):
        device = self.devices[mac]
        hint = hints.get(device["ip"]) or ("Roteador" if device["ip"] == self.gateway else None)
        watched = device["watch"] if isinstance(device.get("watch"), bool) else hint is not None
        return {"id": mac, "mac": "-".join(mac[i:i + 2] for i in range(0, 12, 2)).upper(), "ip": device["ip"],
                "name": device.get("name"), "hint": hint, "host": device.get("host"),
                "label": device.get("name") or hint or device.get("host") or "Aparelho sem nome",
                "online": mac in self.online, "known": device.get("known", True), "watched": watched,
                "private": int(mac[1], 16) & 2 == 2, "firstSeen": device.get("firstSeen"), "lastSeen": device.get("lastSeen")}

    def status(self):
        with self.lock:
            hints = self.hints()
            devices = [self._view(mac, hints) for mac in self.devices]
            ip_order = lambda d: tuple(int(p) for p in d["ip"].split("."))
            devices.sort(key=lambda d: (not d["online"], d["known"], ip_order(d)))
            learning = self.learn_until is None or self.clock() < self.learn_until
            return {"devices": deepcopy(devices), "scanned": self.scanned, "error": self.error, "scanning": self.busy.locked(),
                    "learningUntil": self.learn_until if learning else None,
                    "online": len(self.online), "unknown": sum(1 for d in devices if not d["known"])}

    def update(self, mac, body):
        if not isinstance(body, dict) or not body or not set(body) <= {"name", "known", "watch"}:
            raise AppError("Ajuste inválido.")
        if "name" in body and body["name"] not in ("", None) and (not isinstance(body["name"], str) or not body["name"].strip() or len(body["name"].strip()) > 40):
            raise AppError("Dê um nome de até 40 caracteres.")
        if any(key in body and type(body[key]) is not bool for key in ("known", "watch")):
            raise AppError("Ajuste inválido.")
        with self.lock:
            device = self.devices.get(mac)
            if device is None:
                raise AppError("Aparelho não encontrado.", 404, "not_found")
            if "name" in body:
                device["name"] = _label(body["name"])
                device["known"] = True if device["name"] else device.get("known", True)
            if "known" in body:
                device["known"] = body["known"]
            if "watch" in body:
                device["watch"] = body["watch"]
                if not body["watch"]:
                    self.misses.pop(mac, None)
                    self.down.discard(mac)
            self._save()
        return self.status()

    def remove(self, mac):
        with self.lock:
            if self.devices.pop(mac, None) is None:
                raise AppError("Aparelho não encontrado.", 404, "not_found")
            self.online.discard(mac)
            self._save()
        return self.status()

    def start(self, stop_event):
        def loop():
            stop_event.wait(90)  # deixa o servidor e a rede subirem
            while not stop_event.is_set():
                try:
                    self.scan()
                except Exception:
                    with self.lock:
                        self.error = "A varredura falhou."
                stop_event.wait(SCAN_EVERY)

        threading.Thread(target=loop, daemon=True, name="casa-rede").start()
