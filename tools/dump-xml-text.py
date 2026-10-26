#!/usr/bin/env python3
"""dump-xml-text.py — list text/content-desc values from a uiautomator dump."""
import re
import sys

for path in sys.argv[1:]:
    t = open(path, "rb").read().decode("utf-8", errors="ignore")
    vals = re.findall(r'text="([^"]+)"', t)
    desc = re.findall(r'content-desc="([^"]+)"', t)
    print(f"=== {path} : {len(vals)} text, {len(desc)} content-desc ===")
    for v in vals[:40]:
        print("  T:", v[:110])
    for v in desc[:10]:
        print("  D:", v[:110])
