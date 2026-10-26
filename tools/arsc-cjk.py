#!/usr/bin/env python3
"""arsc-cjk.py — count CJK in an APK's resources.arsc (string pool), per file."""
import re
import sys
import zipfile

CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")

for apk in sys.argv[1:]:
    with zipfile.ZipFile(apk) as z:
        t = z.read("resources.arsc").decode("utf-8", "ignore")
    hits = CJK.findall(t)
    # crude but comparable metric across builds
    print(f"{apk}: CJK chars in arsc = {len(hits)}, distinct = {len(set(hits))}")
