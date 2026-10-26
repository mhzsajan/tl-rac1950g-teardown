#!/usr/bin/env python3
"""
pack-apk.py — rebuild an APK with selected asset entries replaced.

Preserves every other entry's compress_type and metadata, so resources.arsc,
classes*.dex, lib/ and all resources stay exactly as they were. Only the asset
entries you name are swapped. This deliberately avoids any apktool resource
round-trip: a previous full rebuild corrupted resource IDs and crashed the app.

Usage:
  python pack-apk.py --base BASE.apk --out OUT.apk \
      --replace "assets/plugins/X.bin=patched.bin" \
      --replace "assets/rn_sdk/sdk.bundle=patched_sdk.bundle"
"""
import argparse
import hashlib
import os
import sys
import zipfile


def sha256(path, limit=None):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1 << 20)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--replace", action="append", default=[], metavar="ENTRY=PATH")
    ap.add_argument("--list", action="store_true", help="list entries and compression")
    args = ap.parse_args()

    replacements = {}
    for spec in args.replace:
        if "=" not in spec:
            sys.exit(f"bad --replace spec: {spec}")
        name, path = spec.split("=", 1)
        if not os.path.exists(path):
            sys.exit(f"replacement missing on disk: {path}")
        replacements[name] = path

    with zipfile.ZipFile(args.base) as src:
        infos = src.infolist()
        if args.list:
            for i in infos:
                print(f"{i.filename:70s} {i.file_size:>12d} {i.compress_size:>12d} {i.compress_type}")
            return
        names = {i.filename for i in infos}
        for name in replacements:
            if name not in names:
                sys.exit(f"entry not in base APK: {name}")

        total = len(infos)
        with zipfile.ZipFile(args.out, "w") as dst:
            for n, info in enumerate(infos, 1):
                name = info.filename
                if name in replacements:
                    with open(replacements[name], "rb") as f:
                        data = f.read()
                    # keep the original compression decision (assets are deflated)
                    dst.writestr(info, data, compress_type=info.compress_type)
                    print(f"  REPLACED {name}  {info.file_size} -> {len(data)} B")
                elif info.is_dir():
                    dst.writestr(info, b"")
                else:
                    dst.writestr(info, src.read(name), compress_type=info.compress_type)
                if n % 2000 == 0:
                    print(f"  ... {n}/{total}")

    print(f"wrote {args.out}  {os.path.getsize(args.out):,} B  sha256={sha256(args.out)}")

    # integrity re-check
    with zipfile.ZipFile(args.out) as z:
        bad = z.testzip()
        print(f"zip entries={len(z.infolist())} testzip={'OK' if bad is None else 'CORRUPT ' + str(bad)}")
        for name in replacements:
            print(f"  {name}: {z.getinfo(name).file_size:,} B stored")


if __name__ == "__main__":
    main()
