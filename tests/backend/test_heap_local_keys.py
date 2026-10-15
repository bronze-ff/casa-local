"""Synthetic HPROF fixtures: no user dump or real key belongs in this suite."""
import struct
import unittest

from backend.heap_local_keys import Heap


def u4(value):
    return struct.pack(">I", value)


def record(tag, body):
    return struct.pack(">BII", tag, 0, len(body)) + body


def fixture(devices, padding=False):
    names = {1: "java.lang.Object", 2: "java.lang.String", 3: "example.DeviceBean",
             4: "count", 5: "value", 6: "devId", 7: "localKey"}
    head = b"JAVA PROFILE 1.0.3\0" + u4(4) + b"\0" * 8
    records = b"".join(record(1, u4(k) + v.encode()) for k, v in names.items())
    for class_id, name_id in ((100, 1), (200, 2), (300, 3)):
        records += record(2, u4(class_id) + u4(class_id) + u4(0) + u4(name_id))

    def cls(cid, parent, fields):
        prefix = u4(cid) + u4(0) + u4(parent) + u4(0) * 5 + u4(8)
        return b"\x20" + prefix + struct.pack(">HHH", 0, 0, len(fields)) + b"".join(u4(name) + bytes([kind]) for name, kind in fields)

    heap = cls(100, 0, []) + cls(200, 100, [(4, 10), (5, 2)]) + cls(300, 100, [(6, 2), (7, 2)])
    strings, objects = [], []
    for index, (device_id, key) in enumerate(devices):
        refs = []
        for off, text in enumerate((device_id, key)):
            oid, aid = 1000 + index * 10 + off, 2000 + index * 10 + off
            raw = text.encode("utf-16-be")
            strings.append(b"\x23" + u4(aid) + u4(0) + u4(len(text)) + b"\x05" + raw)
            payload = u4(len(text)) + u4(aid)
            strings.append(b"\x21" + u4(oid) + u4(0) + u4(200) + u4(len(payload)) + payload)
            refs.append(oid)
        payload = b"".join(u4(ref) for ref in refs)
        objects.append(b"\x21" + u4(4000 + index) + u4(0) + u4(300) + u4(len(payload)) + payload)
    heap += b"".join(objects)
    if padding:
        heap += b"\x23" + u4(9000) + u4(0) + u4(16000) + b"\x08" + b"x" * 16000
    heap += b"".join(strings)
    return head + records + record(0x1c, heap)


class HeapKeysTests(unittest.TestCase):
    def setUp(self):
        self.lamp_id = "testlamp0000000000001"  # ID sintético; os reais ficam em .data/site.json

    def test_object_reference_resolves_distant_fields_without_json(self):
        heap = Heap(fixture([(self.lamp_id, "test-key-value!!")], padding=True))
        result, evidence = heap.recover({self.lamp_id})
        self.assertEqual(result, {self.lamp_id: "test-key-value!!"})
        self.assertEqual(evidence[0]["keyLength"], 16)
        self.assertNotIn("key", evidence[0])

    def test_unrelated_device_is_excluded(self):
        heap = Heap(fixture([("not-the-owner-device", "test-key-value!!")]))
        self.assertEqual(heap.recover({self.lamp_id})[0], {})

    def test_wrong_length_is_not_a_key(self):
        heap = Heap(fixture([(self.lamp_id, "too-short")]))
        self.assertEqual(heap.recover({self.lamp_id})[0], {})

    def test_independent_equal_copies_are_deduplicated(self):
        heap = Heap(fixture([(self.lamp_id, "test-key-value!!")] * 2))
        result, evidence = heap.recover({self.lamp_id})
        self.assertEqual(len(result), 1)
        self.assertEqual(len(evidence), 2)

    def test_conflicting_keys_fail_closed(self):
        heap = Heap(fixture([(self.lamp_id, "test-key-value!!"), (self.lamp_id, "other-test-value")]))
        with self.assertRaises(ValueError):
            heap.recover({self.lamp_id})

    def test_truncated_dump_is_rejected(self):
        with self.assertRaises(ValueError):
            Heap(fixture([(self.lamp_id, "test-key-value!!")])[:-1])


if __name__ == "__main__":
    unittest.main()
