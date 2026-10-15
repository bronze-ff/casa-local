"""Offline Android HPROF reader scoped to this home's three known device IDs (from .data/site.json).

Never prints string contents or writes plaintext keys. This does not acquire a
dump, authenticate, contact a cloud service, or send a device command.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct

from .config import DATA_DIR, dpapi
from .site import known_devices, load_site


SIZES = {4: 1, 5: 2, 6: 4, 7: 8, 8: 1, 9: 2, 10: 4, 11: 8}
ROOT_SIZES = {0xff: 0, 0x01: "id", 0x02: 8, 0x03: 8, 0x04: 4,
              0x05: 0, 0x06: 4, 0x07: 0, 0x08: 8, 0x89: 0,
              0x8a: 0, 0x8b: 0, 0x8c: 0, 0x8d: 0, 0x8e: 8, 0x90: 0}


class Heap:
    def __init__(self, data):
        self.data = data
        end = data.find(b"\0", 0, 40)
        if end < 0 or data[:end] not in {b"JAVA PROFILE 1.0.2", b"JAVA PROFILE 1.0.3"}:
            raise ValueError("Unsupported HPROF header")
        self.id_size = struct.unpack_from(">I", data, end + 1)[0]
        if self.id_size not in {4, 8}:
            raise ValueError("Unsupported ID width")
        self.strings, self.names, self.classes = {}, {}, {}
        self.instances, self.arrays = {}, {}
        self.class_counts = Counter()
        pos = end + 13
        while pos < len(data):
            if pos + 9 > len(data):
                raise ValueError("Truncated record header")
            tag, _, length = struct.unpack_from(">BII", data, pos)
            start, stop = pos + 9, pos + 9 + length
            if stop > len(data):
                raise ValueError("Truncated record")
            if tag == 1:
                self.strings[self.ident(start)] = data[start + self.id_size:stop].decode("utf-8", "replace")
            elif tag == 2:
                class_id = self.ident(start + 4)
                self.names[class_id] = self.ident(start + 8 + self.id_size)
            elif tag in {0x0c, 0x1c}:
                self.parse_heap(start, stop)
            pos = stop

    def ident(self, pos):
        return struct.unpack_from(">I" if self.id_size == 4 else ">Q", self.data, pos)[0]

    def u2(self, pos):
        return struct.unpack_from(">H", self.data, pos)[0]

    def u4(self, pos):
        return struct.unpack_from(">I", self.data, pos)[0]

    def size(self, kind):
        if kind == 2:
            return self.id_size
        if kind not in SIZES:
            raise ValueError("Unknown field type")
        return SIZES[kind]

    def parse_heap(self, pos, stop):
        data, ids = self.data, self.id_size
        while pos < stop:
            tag = data[pos]
            pos += 1
            if tag in ROOT_SIZES:
                extra = ROOT_SIZES[tag]
                pos += ids + (ids if extra == "id" else extra)
            elif tag == 0xfe:
                pos += 4 + ids
            elif tag == 0x20:
                object_id = self.ident(pos)
                super_id = self.ident(pos + ids + 4)
                pos += ids * 7 + 8
                count = self.u2(pos)
                pos += 2
                for _ in range(count):
                    kind = data[pos + 2]
                    pos += 3 + self.size(kind)
                count = self.u2(pos)
                pos += 2
                for _ in range(count):
                    kind = data[pos + ids]
                    pos += ids + 1 + self.size(kind)
                count = self.u2(pos)
                pos += 2
                fields = []
                for _ in range(count):
                    fields.append((self.ident(pos), data[pos + ids]))
                    pos += ids + 1
                self.classes[object_id] = (super_id, fields)
            elif tag == 0x21:
                object_id = self.ident(pos)
                class_id = self.ident(pos + ids + 4)
                length = self.u4(pos + ids * 2 + 4)
                pos += ids * 2 + 8
                self.instances[object_id] = (class_id, pos, length)
                self.class_counts[class_id] += 1
                pos += length
            elif tag == 0x22:
                count = self.u4(pos + ids + 4)
                pos += ids * 2 + 8 + count * ids
            elif tag in {0x23, 0xc3}:
                object_id = self.ident(pos)
                count = self.u4(pos + ids + 4)
                kind = data[pos + ids + 8]
                pos += ids + 9
                length = count * self.size(kind)
                if tag == 0x23:
                    self.arrays[object_id] = (kind, pos, count)
                    pos += length
            else:
                raise ValueError(f"Unsupported heap tag {tag:#x}")
            if pos > stop:
                raise ValueError("Invalid heap record boundary")

    def class_name(self, class_id):
        return self.strings.get(self.names.get(class_id), "unknown")

    def fields(self, class_id):
        fields, seen = [], set()
        while class_id:
            if class_id in seen or class_id not in self.classes:
                raise ValueError("Incomplete or cyclic class layout")
            seen.add(class_id)
            class_id, own = self.classes[class_id]
            fields.extend((self.strings.get(name, "unknown"), kind) for name, kind in own)
        return fields

    def values(self, object_id):
        class_id, pos, length = self.instances[object_id]
        stop, result = pos + length, {}
        for name, kind in self.fields(class_id):
            size = self.size(kind)
            if pos + size > stop:
                raise ValueError("Truncated instance layout")
            result[name] = (kind, int.from_bytes(self.data[pos:pos + size], "big"))
            pos += size
        if pos != stop:
            raise ValueError("Instance layout does not match payload")
        return result

    def string(self, object_id):
        item = self.instances.get(object_id)
        if not item or self.class_name(item[0]).replace("/", ".") != "java.lang.String":
            return None
        fields = self.values(object_id)
        value = fields.get("value", (0, 0))[1]
        if value not in self.arrays:
            return None
        kind, pos, count = self.arrays[value]
        length = fields.get("count", (0, count))[1]
        offset = fields.get("offset", (0, 0))[1]
        if not 0 <= offset <= count or not 0 <= length <= count - offset or length > 10000:
            return None
        if kind == 5:
            return self.data[pos + offset * 2:pos + (offset + length) * 2].decode("utf-16-be", "strict")
        if kind == 8:
            coder = fields.get("coder", (0, 0))[1]
            raw = self.data[pos + offset:pos + offset + length]
            return raw.decode("latin-1" if coder == 0 else "utf-16-be", "strict")
        return None

    def device_classes(self):
        result = {}
        for class_id in self.classes:
            layout = self.fields(class_id)
            names = {name for name, _ in layout}
            if "localKey" in names and names.intersection({"devId", "deviceId", "id"}):
                result[class_id] = layout
        return result

    def recover(self, allowed, names=None):
        classes, found, evidence = self.device_classes(), {}, []
        for object_id, (class_id, _, _) in self.instances.items():
            if class_id not in classes:
                continue
            fields = self.values(object_id)
            provider_id = None
            for name in ("devId", "deviceId", "id"):
                if fields.get(name, (0, 0))[0] == 2:
                    value = self.string(fields[name][1])
                    if value in allowed:
                        provider_id = value
                        break
            if not provider_id:
                continue
            reference = fields.get("localKey", (0, 0))
            key = self.string(reference[1]) if reference[0] == 2 else None
            if key and len(key) == 16 and key.isascii():
                found.setdefault(provider_id, set()).add(key)
                evidence.append({"device": (names or {}).get(provider_id, "aparelho"), "class": self.class_name(class_id),
                                 "instanceOffset": self.instances[object_id][1], "keyLength": len(key)})
        if any(len(keys) != 1 for keys in found.values()):
            raise ValueError("Conflicting keys: no bundle was written")
        return {provider_id: next(iter(keys)) for provider_id, keys in found.items()}, evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--heap", type=Path, required=True)
    parser.add_argument("--provider", choices=["izy", "geonav"], required=True)
    parser.add_argument("--inspect", action="store_true", help="Class/field names and counts only")
    args = parser.parse_args()
    try:
        raw = args.heap.read_bytes()
        heap = Heap(raw)
        classes = heap.device_classes()
        summary = {"classes": len(heap.classes), "instances": len(heap.instances),
                   "deviceClasses": [{"name": heap.class_name(cid), "instances": heap.class_counts[cid],
                                      "fields": [name for name, _ in fields]} for cid, fields in classes.items()]}
        if args.inspect:
            print(json.dumps(summary, ensure_ascii=True))
            return
        known = known_devices(load_site())
        allowed = {key for key, name in known.items() if (name == "central-ir") == (args.provider == "geonav")}
        keys, evidence = heap.recover(allowed, known)
        output_dir = DATA_DIR / "key-recovery"
        output_dir.mkdir(parents=True, exist_ok=True)
        report = {"provider": args.provider, "heapSha256": hashlib.sha256(raw).hexdigest(),
                  "devices": [{"id": known[provider_id], "providerId": provider_id, "keyRecovered": provider_id in keys}
                              for provider_id in sorted(allowed)], "evidence": evidence,
                  "physicallyValidated": False}
        if keys:
            bundle = {"provider": args.provider, "keys": keys, "heapSha256": report["heapSha256"]}
            encrypted = dpapi(json.dumps(bundle).encode("utf-8"))
            target = output_dir / (args.provider + ".dpapi")
            target.write_bytes(encrypted)
            if json.loads(dpapi(target.read_bytes(), decrypt=True)) != bundle:
                raise ValueError("Encrypted bundle verification failed")
            report["encryptedBundle"] = target.name
        (output_dir / (args.provider + "-status.json")).write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps({"provider": args.provider, "recoveredCount": len(keys), "expectedCount": len(allowed),
                          "encrypted": bool(keys), "physicallyValidated": False}, ensure_ascii=True))
    except Exception as error:
        print(json.dumps({"status": "failed", "reasonType": type(error).__name__,
                          "message": "No keys displayed; inspect format and class layout locally."}))
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
