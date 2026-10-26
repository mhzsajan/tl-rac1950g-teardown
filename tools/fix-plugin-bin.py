#!/usr/bin/env python3
"""
fix-plugin-bin.py — repair the plugin container header after replacing the ZIP.

Container layout (reverse-engineered from the vendor file, big-endian u32 header):

    [0..176)    44 x u32 header
      u[0] = 1                     format version
      u[1..5] = 24, 23, 34, 21, 46 (fixed tables/counts, unchanged)
      u[6]  = 176                  offset of description.zip section
      u[7]  = 559                  length of description.zip section
      u[8]  = 735                  offset of the 22-byte trailer
      u[9]  = 22                   trailer length
      u[10] = 757                  offset of the main plugin ZIP
      u[11] = <main ZIP length>    ** must equal fileSize - 757 **

    [176..735)  description.zip (1 entry: describe.json)  -- kept byte-identical
    [735..757)  22-byte trailer                            -- kept byte-identical
    [757..EOF)  main plugin ZIP (326 entries)

The app reads the main ZIP using u[11]; if the ZIP is rebuilt to a different
size and u[11] is left at the vendor value, the plugin fails to decompress at
startup and the app shows "Initialization failed / not installed correctly".
"""
import struct
import sys
import zipfile

src, out = sys.argv[1], sys.argv[2]
b = open(src, "rb").read()
u = list(struct.unpack(">44I", b[:176]))

if u[10] != 757 or u[8] != 735:
    sys.exit(f"unexpected layout: u[8]={u[8]} u[10]={u[10]}")

zipdata = b[u[10]:]
declared = u[11]
actual = len(zipdata)
print(f"main zip offset {u[10]}, declared length {declared}, actual length {actual}")

with zipfile.ZipFile(__import__("io").BytesIO(zipdata)) as z:
    names = z.namelist()
    print(f"zip entries: {len(names)}, testzip: {z.testzip()}")
    for n in ("business.bundle",):
        print(f"  {n}: {z.getinfo(n).file_size:,} B")

u[11] = actual
header = struct.pack(">44I", *u)
fixed = header + b[176:]
open(out, "wb").write(fixed)
print(f"wrote {out}  {len(fixed):,} B  (was {len(b):,} B)")

# verify
chk = open(out, "rb").read()
u2 = struct.unpack(">44I", chk[:176])
assert u2[11] == len(chk) - 757, "header length field still wrong"
with zipfile.ZipFile(__import__("io").BytesIO(chk[757:])) as z:
    assert z.testzip() is None
    print(f"verified: u[11]={u2[11]} == fileSize-757={len(chk)-757}; business.bundle readable ({z.getinfo('business.bundle').file_size:,} B)")
