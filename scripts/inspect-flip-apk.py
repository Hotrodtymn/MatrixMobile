"""Inspect compiled DEX classes and native diagnostic markers without installing an APK."""
import argparse
import hashlib
import json
import struct
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("apk", type=Path)
parser.add_argument("--require-v2", action="store_true")
args = parser.parse_args()
expected = {
    "Lexpo/modules/alarm/AlarmSchedulerModule;",
    "Lexpo/modules/alarm/AlarmSchedulerRingService;",
    "Lexpo/modules/alarm/AlarmSchedulerRingActivity;",
    "Lexpo/modules/alarm/MatrixFlipDetector;",
}
classes = set()
markers = {name: False for name in [
    "setFlipToSilenceEnabledAsync", "flipToSilence", "MATRIX_RING_STOPPED",
    "flip-v2 registered=", "flip-v2 silence requested", "flip-v2 silence complete",
    "flip-v2 closing ringing activity", "flip-v2 preference enabled=",
]}
with zipfile.ZipFile(args.apk) as archive:
    for name in archive.namelist():
        if not name.endswith(".dex"):
            continue
        data = archive.read(name)
        if not data.startswith(b"dex\n"):
            continue
        _, string_offset, _, type_offset = struct.unpack_from("<4I", data, 0x38)
        class_count, class_offset = struct.unpack_from("<2I", data, 0x60)
        for index in range(class_count):
            class_index = struct.unpack_from("<I", data, class_offset + index * 32)[0]
            string_index = struct.unpack_from("<I", data, type_offset + class_index * 4)[0]
            offset = struct.unpack_from("<I", data, string_offset + string_index * 4)[0]
            while data[offset] & 0x80:
                offset += 1
            offset += 1  # skip UTF-16 length's final ULEB128 byte
            descriptor = data[offset:data.index(b"\0", offset)].decode("utf-8", errors="replace")
            if descriptor in expected:
                classes.add(descriptor)
        for marker in markers:
            markers[marker] |= marker.encode() in data
result = {
    "apk": str(args.apk), "sha256": hashlib.sha256(args.apk.read_bytes()).hexdigest(),
    "compiled_classes": sorted(classes), "missing_classes": sorted(expected - classes),
    "native_markers": markers,
}
print(json.dumps(result, indent=2))
if args.require_v2 and (expected != classes or not all(markers.values())):
    raise SystemExit("APK does not contain the complete flip-v2 native implementation")
