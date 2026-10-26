# tools

Scripts used to translate and rebuild `com.tplink.ipc`. Worked examples of the
whole pipeline are in `../STATUS.md` and `../docs/app-localization.md`.

## Translation

| Script | Purpose |
|---|---|
| `build-cache.mjs` | Scans the pristine decoded tree + vendor bundles for CJK string literals and translates them to English into `data/cache.json`. Uses Google Translate `clients5` (~11 req/s), retries, the curated short-label table, and writes a coverage report. |
| `fix-cache.mjs` | Clean-up pass over the cache: repairs residual Chinese in long prose, enforces format-specifier parity, restores `\n\n` structure, capitalises standalone labels, and deliberately leaves the pinyin data tables alone. |
| `repair-lines.mjs` | Restores line structure in multi-line dialog translations by re-translating line by line. Run after any pass that touched whitespace. |
| `scan.mjs` | Counts CJK in a bundle **correctly**: decodes Metro's `\uXXXX` escapes first and reports the raw (wrong) number next to it. Also lists CJK literals and mangled hybrids. |
| `check-fw.mjs` | Greps a bundle for router-management vocabulary (firmware/upgrade/reboot/…) — used to confirm the firmware-upgrade UI exists before promising it. |
| `dump-xml-text.py` | Prints `text` / `content-desc` values from a `uiautomator` dump. |

## Build / packaging

| Script | Purpose |
|---|---|
| `pack-apk.py` | Rebuilds an APK replacing only the named asset entries. Preserves every other entry's compression method and bytes, so `resources.arsc`, dex, lib and manifest stay untouched. |
| `build-final.ps1` | One command: pack → zipalign → apksigner → static verification. |
| `sign-apk.ps1` | zipalign + sign + verify an already-packed APK. |
| `verify_apk.py` | Acceptance gate on a finished APK: CJK per surface (`resources.arsc`, `business.bundle`, `sdk.bundle`), zip integrity, dex/lib presence. **Caveat:** it decodes the whole `arsc` as UTF-8, so a single stray binary byte can look like one CJK character; for the authoritative resource number use `aapt2 dump strings <apk>` and count CJK in the UTF-16 dump. |
| `slim.py` | Produces a stripped router-only APK: drops the camera/NVR Vue module, AI models, chime audio, 32-bit libs and plugin market (161 MB → 94 MB). Cannot affect resource IDs or dex. |

## Plugin container (the part nobody documents)

| Script | Purpose |
|---|---|
| `rebuild-plugin-bin.py` | Rebuilds `assets/plugins/*.bin` **consistently** after patching `business.bundle`: correct `describe.json.bundleMd5`, correct header `u[7]/u[8]/u[10]/u[11]`, description ZIP + 22-byte trailer + main ZIP. This is the script to use. |
| `fix-plugin-bin.py` | Minimal fix: patch only header field `u[11]` (main-ZIP length) when a rebuilt ZIP changed size. Use when you already have a correct description section. |

## Device

| Script | Purpose |
|---|---|
| `dev.ps1` | adb driver: `install`, `launch`, `dump`, `tapid`, `taptext`, `tappy`, `key`, `shot`, `cjk`. PowerShell on purpose — Node's `child_process` with piped stdio is blocked by the sandbox (`EPERM`), and it also avoids the local-name collision that shadowed `adb`. |

## Data

- `../data/cache.json` — 11,849 zh→en entries (the translation work product).
- `../data/fix-report.json` — what the clean-up pass changed and why.
- `../evidence/` — resource build report, resource-ID stability proof, bundle report.

## Requirements

`node` ≥ 20 (fetch), Python 3.11+, JDK 11+ and `apktool` 3.0.3, Android
`build-tools` (`aapt2`, `zipalign`, `apksigner`), `adb`. Nothing is installed by
these scripts; paths are passed as arguments except in the two `.ps1` wrappers,
which assume the local layout described in `../STATUS.md`.
