#!/usr/bin/env python3
"""rezip-main.py — rebuild the plugin's inner ZIP with a replaced business.bundle."""
import sys
import zipfile

src, bundle_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(src) as zin:
    infos = zin.infolist()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zout:
        for info in infos:
            data = open(bundle_path, "rb").read() if info.filename == "business.bundle" else zin.read(info.filename)
            zout.writestr(info, data, compress_type=info.compress_type)
            if info.filename == "business.bundle":
                print(f"replaced business.bundle: {len(data):,} B")
with zipfile.ZipFile(out) as z:
    print("entries:", len(z.namelist()), "testzip:", z.testzip())
