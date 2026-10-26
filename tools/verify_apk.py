#!/usr/bin/env python3
"""
verify_apk.py — acceptance gate for the translated APK.

Reports, from the FINAL apk itself (not from intermediate files):
  * package / version
  * CJK remaining in resources.arsc            (native Android strings)
  * CJK remaining in business.bundle           (router React Native UI)
  * CJK remaining in sdk.bundle                (app shell React Native UI)
  * samples of whatever Chinese is left, so nothing hides behind a count
  * zip integrity + presence of expected assets

Usage: python verify_apk.py APK [--json OUT]
"""
import io
import json
import re
import sys
import zipfile

CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
ESC = re.compile(r"\\u([0-9a-fA-F]{4})")


def decode_escapes(s: str) -> str:
    return ESC.sub(lambda m: chr(int(m.group(1), 16)), s)


def cjk_report(text: str, label: str, samples=25):
    hits = CJK.findall(text)
    uniq = set(hits)
    runs = re.findall(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]{2,}", text)
    return {
        "label": label,
        "cjkChars": len(hits),
        "cjkUnique": len(uniq),
        "sampleRuns": sorted(set(runs), key=len, reverse=True)[:samples],
    }


def literals_with_cjk(text: str, limit=25):
    """JS string literals whose decoded form still contains CJK."""
    out = []
    for m in re.finditer(r'"((?:[^"\\\n]|\\.)*)"|\'((?:[^\'\\\n]|\\.)*)\'', text):
        body = m.group(1) or m.group(2) or ""
        d = decode_escapes(body)
        if CJK.search(d):
            out.append(d)
            if len(out) >= limit:
                break
    return out


def main():
    apk_path = sys.argv[1]
    json_out = None
    if "--json" in sys.argv:
        json_out = sys.argv[sys.argv.index("--json") + 1]

    result = {"apk": apk_path}
    with zipfile.ZipFile(apk_path) as z:
        bad = z.testzip()
        result["zipIntegrity"] = "OK" if bad is None else f"CORRUPT:{bad}"
        names = z.namelist()
        result["entries"] = len(names)

        # --- resources.arsc
        arsc = z.read("resources.arsc").decode("utf-8", "ignore")
        result["resources"] = cjk_report(arsc, "resources.arsc")

        # --- router plugin bundle
        plugin = [n for n in names if n.startswith("assets/plugins/") and n.endswith(".bin")]
        result["pluginEntries"] = plugin
        if plugin:
            data = z.read(plugin[0])
            inner = data[176:] if data[:2] != b"PK" else data
            try:
                with zipfile.ZipFile(io.BytesIO(inner)) as pz:
                    biz = pz.read("business.bundle").decode("utf-8", "ignore")
                result["businessBundleBytes"] = len(biz.encode("utf-8", "ignore"))
                rep = cjk_report(decode_escapes(biz), "business.bundle")
                rep["literalsWithCjk"] = literals_with_cjk(biz)
                result["businessBundle"] = rep
            except Exception as e:  # noqa: BLE001
                result["businessBundle"] = {"error": str(e)}

        # --- app shell bundle
        if "assets/rn_sdk/sdk.bundle" in names:
            sdk = z.read("assets/rn_sdk/sdk.bundle").decode("utf-8", "ignore")
            result["sdkBundleBytes"] = len(sdk.encode("utf-8", "ignore"))
            rep = cjk_report(decode_escapes(sdk), "sdk.bundle")
            rep["literalsWithCjk"] = literals_with_cjk(sdk)
            result["sdkBundle"] = rep

        # --- sanity: expected non-translated payload still present
        result["hasTppModule"] = any(n.startswith("assets/android-TPP") for n in names)
        result["hasPluginMarket"] = "assets/pluginMarket/dist.zip" in names
        result["dexFiles"] = [n for n in names if re.match(r"classes\d*\.dex$", n)]
        result["libAbis"] = sorted({n.split("/")[1] for n in names if n.startswith("lib/") and n.count("/") > 1})

    payload = json.dumps(result, indent=1, ensure_ascii=False)
    print(payload)
    if json_out:
        with open(json_out, "w", encoding="utf-8") as f:
            f.write(payload + "\n")
    # compact verdict
    r = result
    print("\n--- VERDICT ---")
    for k in ("resources", "businessBundle", "sdkBundle"):
        if k in r and isinstance(r[k], dict) and "cjkChars" in r[k]:
            print(f"{k:16s} remaining CJK chars: {r[k]['cjkChars']:>6d}  unique {r[k]['cjkUnique']}")
    print(f"zip: {r['zipIntegrity']}  entries={r['entries']}  dex={len(r.get('dexFiles', []))}")


if __name__ == "__main__":
    main()
