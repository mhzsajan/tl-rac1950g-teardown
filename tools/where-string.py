#!/usr/bin/env python3
"""where-string.py — locate a string inside the built APK's surfaces.

Usage: python where-string.py <apk> <zh-or-en string> [...]

Reports, per surface (resources.arsc / business.bundle / sdk.bundle), whether the
string is present (raw bytes, and for bundles also after decoding \\uXXXX).
"""
import io
import re
import sys
import zipfile

apk = sys.argv[1]
needles = sys.argv[2:]
ESC = re.compile(rb"\\u([0-9a-fA-F]{4})")


def has_u16(data: bytes, s: str) -> bool:
    return s.encode("utf-16-le") in data


def has_u8(data: bytes, s: str) -> bool:
    return s.encode("utf-8") in data


def bundle_text(raw: bytes) -> str:
    t = raw.decode("utf-8", "ignore")
    return t


def decode_esc(t: str) -> str:
    return re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), t)


z = zipfile.ZipFile(apk)
arsc = z.read("resources.arsc")
plugin = [n for n in z.namelist() if n.startswith("assets/plugins/") and n.endswith(".bin")][0]
pb = z.read(plugin)
inner = pb[176:] if pb[:2] != b"PK" else pb
with zipfile.ZipFile(io.BytesIO(inner)) as pz:
    biz_raw = pz.read("business.bundle")
sdk_raw = z.read("assets/rn_sdk/sdk.bundle")

biz = decode_esc(bundle_text(biz_raw))
sdk = decode_esc(bundle_text(sdk_raw))
arsc_txt = arsc.decode("utf-8", "ignore")

for n in needles:
    print(f"\n=== {n!r} ===")
    print(f"  resources.arsc (utf8 text) : {n in arsc_txt}")
    print(f"  resources.arsc (utf16le)   : {has_u16(arsc, n)}")
    print(f"  business.bundle (decoded)  : {biz.count(n)}")
    print(f"  sdk.bundle (decoded)       : {sdk.count(n)}")
