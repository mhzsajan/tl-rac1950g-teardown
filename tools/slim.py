#!/usr/bin/env python3
"""
slim.py — build a stripped-down APK by dropping unused payloads.

The app is the full TP-Link ecosystem (routers + cameras + NVR + cloud). The
user only needs LOCAL ROUTER MANAGEMENT, so the camera/cloud payloads — which
are pure data, never code — can go. Dropping data entries cannot renumber
resources or touch the dex, so it cannot reproduce the "Missing required view"
class of failure; the only risk is a module loading lazily at runtime and
finding its data absent, which is why the router screens are re-tested after
trimming.

Usage:
  python slim.py --base APK --out APK [--report JSON] [--dry-run]
"""
import argparse
import json
import os
import zipfile

# (label, predicate on entry name)
GROUPS = [
    ("camera/NVR web module", lambda n: n.startswith("assets/android-TPP_GENERAL_MODULE")),
    ("plugin market UI", lambda n: n.startswith("assets/pluginMarket/")),
    ("AI/ML models", lambda n: n.endswith(".tflite")),
    ("camera chime audio", lambda n: n.startswith("assets/audios/")),
    ("32-bit native libs", lambda n: n.startswith("lib/armeabi-v7a/")),
    ("x86 native libs", lambda n: n.startswith("lib/x86")),
    ("HMS/Huawei cloud cas", lambda n: n.endswith(("hmsrootcas.bks", "updatesdkcas.bks"))),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--out")
    ap.add_argument("--report")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--keep", action="append", default=[], help="extra label to KEEP (not strip)")
    args = ap.parse_args()

    groups = [g for g in GROUPS if g[0] not in args.keep]

    with zipfile.ZipFile(args.base) as src:
        infos = src.infolist()
        total = sum(i.file_size for i in infos)
        strip = set()
        stats = {}
        for label, pred in groups:
            names = [i.filename for i in infos if pred(i.filename)]
            size = sum(i.file_size for i in infos if pred(i.filename))
            stats[label] = {"files": len(names), "bytes": size}
            strip.update(names)
        # safety: never strip dex, arsc, manifest, resources, plugin bundles, sdk bundle
        protected_prefixes = ("classes", "resources.arsc", "AndroidManifest.xml", "res/",
                              "assets/plugins/", "assets/rn_sdk/", "META-INF/")
        removed_protected = [n for n in strip if n.startswith(protected_prefixes)]
        if removed_protected:
            raise SystemExit(f"refusing to strip protected entries: {removed_protected[:5]}")
        kept = [i for i in infos if i.filename not in strip]
        kept_total = sum(i.file_size for i in kept)
        report = {
            "base": args.base,
            "baseEntries": len(infos),
            "baseBytes": total,
            "keptEntries": len(kept),
            "keptBytes": kept_total,
            "savedBytes": total - kept_total,
            "savedMB": round((total - kept_total) / 1048576, 1),
            "removedGroups": stats,
            "keptABIs": sorted({i.filename.split("/")[1] for i in kept if i.filename.startswith("lib/") and i.filename.count("/") > 1}),
        }
        print(json.dumps(report, indent=1))
        if args.report:
            with open(args.report, "w", encoding="utf-8") as f:
                json.dump(report, f, indent=1)

        if args.dry_run or not args.out:
            return

        with zipfile.ZipFile(args.out, "w") as dst:
            for n, info in enumerate(kept, 1):
                name = info.filename
                if info.is_dir():
                    dst.writestr(info, b"")
                else:
                    dst.writestr(info, src.read(name), compress_type=info.compress_type)
                if n % 2000 == 0:
                    print(f"  ... {n}/{len(kept)}")
        print(f"\nwrote {args.out}  {os.path.getsize(args.out):,} B")


if __name__ == "__main__":
    main()
