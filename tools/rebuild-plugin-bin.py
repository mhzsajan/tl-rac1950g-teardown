#!/usr/bin/env python3
"""
rebuild-plugin-bin.py — rebuild the TP-Link plugin container with a CONSISTENT
describe.json after the inner business.bundle has been patched.

Container layout (big-endian u32 header, reverse-engineered from the vendor file):

    [0..176)   44 x u32 header
                 u[6]=176            desc section offset
                 u[7]=len(desc)      desc section length
                 u[8]=u[6]+u[7]      trailer offset
                 u[9]=22             trailer length (empty ZIP EOCD)
                 u[10]=u[8]+u[9]     main zip offset
                 u[11]=len(mainzip)  main zip length
    [176..u[8])        description.zip  -> {"...", "bundleMd5": "<md5 of business.bundle>"}
    [u[8]..u[10])      22-byte empty ZIP EOCD trailer
    [u[10]..EOF)       main plugin ZIP (326 entries, business.bundle replaced)

THE TRAP: the app verifies bundleMd5 from describe.json against the extracted
business.bundle. A patched bundle with a stale bundleMd5 makes plugin init fail
at startup ("Initialization failed / not installed correctly"). The main ZIP
length in u[11] must also match the actual file, or decompression over-reads.

Usage:
  python rebuild-plugin-bin.py --vendor-bin origplugin.bin \
      --main-zip plugin-inner-rebuilt.zip \
      --bundle business.bundle.patched --out plugin-final.bin
"""
import argparse
import hashlib
import io
import json
import struct
import zipfile

EMPTY_EOCD = b"PK\x05\x06" + b"\x00" * 18


def parse_vendor(blob):
    u = list(struct.unpack(">44I", blob[:176]))
    desc_off, desc_len = u[6], u[7]
    assert desc_off == 176, f"unexpected desc offset {desc_off}"
    desc = blob[desc_off:desc_off + desc_len]
    trailer = blob[u[8]:u[8] + u[9]]
    main_zip = blob[u[10]:]
    return u, desc, trailer, main_zip


def read_describe(desc):
    """description.zip has a trailing empty EOCD; strip it before parsing."""
    if desc.endswith(EMPTY_EOCD):
        desc = desc[:-22]
    with zipfile.ZipFile(io.BytesIO(desc)) as z:
        name = z.namelist()[0]
        return name, json.loads(z.read(name).decode("utf-8"))


def build_desc_zip(entry_name, payload: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        info = zipfile.ZipInfo(entry_name, date_time=(2026, 1, 28, 10, 44, 15))
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    return buf.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vendor-bin", required=True)
    ap.add_argument("--main-zip", required=True)
    ap.add_argument("--bundle", required=True, help="patched business.bundle file")
    ap.add_argument("--out", required=True)
    ap.add_argument("--desc-template", help="bin whose describe.json to reuse (default: vendor bin)")
    args = ap.parse_args()

    vendor = open(args.vendor_bin, "rb").read()
    u, desc, trailer, _ = parse_vendor(vendor)
    entry_name, meta = read_describe(desc)

    bundle = open(args.bundle, "rb").read()
    md5 = hashlib.md5(bundle).hexdigest()
    print(f"patched business.bundle: {len(bundle):,} B  md5={md5}")
    print(f"describe.json bundleMd5 : {meta.get('bundleMd5')}  -> {'UNCHANGED' if meta.get('bundleMd5') == md5 else 'UPDATED'}")
    meta["bundleMd5"] = md5

    new_desc = build_desc_zip(entry_name, meta) + EMPTY_EOCD
    main_zip = open(args.main_zip, "rb").read()
    with zipfile.ZipFile(io.BytesIO(main_zip)) as z:
        assert z.testzip() is None
        assert "business.bundle" in z.namelist()
        inner = z.read("business.bundle")
        assert hashlib.md5(inner).hexdigest() == md5, "main zip business.bundle md5 does not match!"

    cnt = list(u)
    cnt[6] = 176
    cnt[7] = len(new_desc)
    cnt[8] = cnt[6] + cnt[7]
    cnt[9] = len(trailer)
    cnt[10] = cnt[8] + cnt[9]
    cnt[11] = len(main_zip)

    blob = struct.pack(">44I", *cnt) + new_desc + trailer + main_zip
    open(args.out, "wb").write(blob)
    print(f"wrote {args.out}  {len(blob):,} B")
    print(f"  desc   @{cnt[6]} len {cnt[7]}")
    print(f"  trailer@{cnt[8]} len {cnt[9]}")
    print(f"  mainzip@{cnt[10]} len {cnt[11]}")

    # ---- round-trip verification, exactly as the app would read it
    chk = open(args.out, "rb").read()
    cu = list(struct.unpack(">44I", chk[:176]))
    assert cu[10] + cu[11] == len(chk), "header length mismatch"
    cdesc = chk[cu[6]:cu[6] + cu[7]]
    cname, cmeta = read_describe(cdesc)
    cmain = chk[cu[10]:cu[10] + cu[11]]
    with zipfile.ZipFile(io.BytesIO(cmain)) as z:
        assert z.testzip() is None
        got = hashlib.md5(z.read("business.bundle")).hexdigest()
    assert cmeta["bundleMd5"] == got, "bundleMd5 mismatch after rebuild"
    print(f"verified: {len(z.namelist())} entries, testzip OK, bundleMd5 {got} matches describe.json")


if __name__ == "__main__":
    main()
