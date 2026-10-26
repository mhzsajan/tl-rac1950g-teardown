#!/usr/bin/env python3
"""list-clickable.py — print clickable/text nodes from a uiautomator dump."""
import re
import sys

path = sys.argv[1]
t = open(path, encoding="utf-8", errors="ignore").read()
for m in re.finditer(r"<node\b([^>]*?)/?>", t):
    a = m.group(1)
    if 'clickable="true"' not in a and "--all" not in sys.argv:
        continue
    def g(k):
        mm = re.search(k + r'="([^"]*)"', a)
        return mm.group(1) if mm else ""
    rid = g("resource-id").split("/")[-1]
    print(f"{rid:38s} {g('text')[:32]:32s} {g('content-desc')[:22]:22s} {g('bounds')}")
