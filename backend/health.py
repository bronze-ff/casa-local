"""Saúde do sistema e backup diário da pasta .data.

Tudo é leitura local: tempo ligado e memória do PC (API do Windows), espaço em disco, aparelhos
online, go2rtc, eventos do DVR, TVs e o vigia (tarefa que reinicia o servidor se ele cair). O
backup copia .data para %LOCALAPPDATA%\\CasaLocal\\backups uma vez por dia (sem as fotos de
movimento) e guarda os 7 últimos; os arquivos DPAPI continuam cifrados para este usuário.
"""
import ctypes
from datetime import datetime
import os
from pathlib import Path
import shutil
import threading
import time
import zipfile

KEEP_BACKUPS = 7


def backup_dir():
    return Path(os.environ.get("CASA_BACKUP_DIR", Path(os.environ.get("LOCALAPPDATA", Path.home())) / "CasaLocal" / "backups"))


class _Memory(ctypes.Structure):
    _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong), ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong), ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]


def machine():
    """Tempo ligado, memória e disco deste PC. Campos ausentes fora do Windows."""
    result = {}
    try:
        kernel32 = ctypes.windll.kernel32
        kernel32.GetTickCount64.restype = ctypes.c_ulonglong  # sem isto o ctypes trunca em 32 bits (~25 dias)
        result["uptime"] = int(kernel32.GetTickCount64() / 1000)
        memory = _Memory()
        memory.dwLength = ctypes.sizeof(_Memory)
        kernel32.GlobalMemoryStatusEx(ctypes.byref(memory))
        result["memory"] = {"used": memory.dwMemoryLoad, "totalGb": round(memory.ullTotalPhys / 2**30, 1)}
    except (AttributeError, OSError):
        pass
    try:
        usage = shutil.disk_usage(Path.home().anchor or "/")
        result["disk"] = {"freeGb": round(usage.free / 2**30, 1), "used": round(100 * usage.used / usage.total)}
    except OSError:
        pass
    return result


class Backups:
    def __init__(self, data_dir, target=None, clock=time.time):
        self.data_dir, self.target, self.clock = Path(data_dir), Path(target) if target else backup_dir(), clock
        self.last_error = None

    def latest(self):
        files = sorted(self.target.glob("casa-data-*.zip")) if self.target.exists() else []
        return files[-1] if files else None

    def run(self):
        """Gera o backup do dia se ainda não existir. Devolve o caminho ou None."""
        stamp = datetime.fromtimestamp(self.clock()).strftime("%Y%m%d")
        destination = self.target / f"casa-data-{stamp}.zip"
        if destination.exists() or not self.data_dir.exists():
            return None
        try:
            self.target.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_suffix(".tmp")
            with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as archive:
                for path in self.data_dir.rglob("*"):
                    relative = path.relative_to(self.data_dir)
                    if path.is_file() and not (relative.parts[0] == "movimento" and path.suffix == ".jpg") and path.suffix != ".tmp":
                        archive.write(path, relative.as_posix())
            temporary.replace(destination)
            for old in sorted(self.target.glob("casa-data-*.zip"))[:-KEEP_BACKUPS]:
                old.unlink()
            self.last_error = None
            return destination
        except OSError as error:
            self.last_error = f"Backup falhou: {error.strerror or 'erro de disco'}"
            return None

    def status(self):
        latest = self.latest()
        return {"last": int(latest.stat().st_mtime) if latest else None, "count": len(list(self.target.glob("casa-data-*.zip"))) if self.target.exists() else 0,
                "error": self.last_error}

    def start(self, stop_event):
        def loop():
            stop_event.wait(120)  # deixa o servidor terminar de subir
            while not stop_event.is_set():
                self.run()
                stop_event.wait(3600)

        threading.Thread(target=loop, daemon=True, name="casa-backup").start()


def watchdog_status(data_dir, clock=time.time):
    log = Path(data_dir) / "vigia.log"
    try:
        lines = log.read_text(encoding="utf-8").strip().splitlines()
        stamp = log.stat().st_mtime
    except OSError:
        return {"installed": False, "lastCheck": None, "lastRestart": None}
    restarts = [line for line in lines if "reiniciou" in line]
    return {"installed": clock() - stamp < 900, "lastCheck": int(stamp), "lastRestart": restarts[-1][:19] if restarts else None}


def report(app, cameras, motion, tvs, backups, started, clock=time.time):
    """Lista de verificações para a tela Central: ok, aviso ou falha, com uma frase cada."""
    checks = []

    def add(key, label, state, detail):
        checks.append({"id": key, "label": label, "state": state, "detail": detail})

    add("server", "Servidor do painel", "ok", f"no ar há {_duration(clock() - started)}")
    for device in app.snapshot()["devices"]:
        if not device.get("configured"):
            continue
        online = device.get("connection") == "online"
        add(device["id"], device["name"], "ok" if online else "fail", "respondendo na rede local" if online else "sem resposta na rede local")
    camera_ok = cameras.available()
    add("go2rtc", "Serviço de câmeras (go2rtc)", "ok" if camera_ok else "fail", "rodando" if camera_ok else "parado")
    motion_status = motion.status(hours=1)
    add("motion", "Eventos de movimento do DVR", "ok" if motion_status["connected"] else "warn",
        "conectado" if motion_status["connected"] else (motion_status["error"] or "conectando"))
    tv_list = tvs.status()["tvs"]
    add("tvs", "TVs na rede", "ok" if tv_list else "warn", f"{len(tv_list)} encontrada(s), {sum(1 for t in tv_list if t['paired'])} pareada(s)" if tv_list else "nenhuma encontrada ainda")
    backup = backups.status()
    age = clock() - backup["last"] if backup["last"] else None
    add("backup", "Backup diário", "fail" if backup["error"] else "ok" if age is not None and age < 2 * 86400 else "warn",
        backup["error"] or (f"último há {_duration(age)} · {backup['count']} guardados" if age is not None else "ainda não feito"))
    watchdog = watchdog_status(app.data_dir, clock)
    add("watchdog", "Vigia (reinicia se cair)", "ok" if watchdog["installed"] else "warn",
        ("ativo" + (f" · último reinício {watchdog['lastRestart']}" if watchdog["lastRestart"] else "")) if watchdog["installed"] else "não instalado neste PC")
    pc = machine()
    if "memory" in pc:
        disk = pc.get("disk", {})
        low_disk = disk.get("freeGb", 99) < 5
        add("pc", "PC de casa", "warn" if pc["memory"]["used"] > 90 or low_disk else "ok",
            f"ligado há {_duration(pc['uptime'])} · memória {pc['memory']['used']}% · disco livre {disk.get('freeGb', '?')} GB")
    worst = "fail" if any(c["state"] == "fail" for c in checks) else "warn" if any(c["state"] == "warn" for c in checks) else "ok"
    return {"state": worst, "checks": checks, "machine": pc}


def _duration(seconds):
    seconds = int(seconds or 0)
    if seconds < 3600:
        return f"{max(1, seconds // 60)} min"
    if seconds < 86400:
        return f"{seconds // 3600} h {seconds % 3600 // 60} min"
    return f"{seconds // 86400} d {seconds % 86400 // 3600} h"
