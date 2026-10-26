# Corrections to the published app/localization section

The device teardown half of `README.md` stands as written. The **app / English
translation** half (`## The app, and the English translation question` and
everything under it) contains claims that a full audit on 2026-10-26 disproved.
This file is the replacement text; `docs/app-localization.md` has the evidence
in full.

---

## Correction 1 — the app does NOT ship a full English translation

**Was:** *"The app already ships a full English translation … `res/values-en/`
8,969 strings, 0 CJK … every one of the 8,967 CJK strings has an English
counterpart."*

**Actually:** the vendor APK contains **no** `values-en` at all. A clean
`apktool d --no-src tplink-orig.apk` yields exactly these locale dirs:
`values/` (Chinese, 10,463 strings, 8,970 containing CJK) and `values-zh/`
(two library strings). There is no `values-en/`, no `values-en-rUS`, nothing.

The `res/values-en/strings.xml` that the earlier pass examined was **its own
generated file**, not the vendor's. Evidence: 8,267 of its 8,968 values are
byte-identical to entries in `mm-cache.json` — a MyMemory translation cache
written by the same pass — and the remaining 611 are hand-written. The examples
quoted as vendor English ("All channels", "Approximately %1$s is required,
please do not leave the current page") are machine translations, which is why
they read like machine translations.

Consequence: there is nothing to "swap in". English has to be **translated**.

## Correction 2 — the resource translation never landed in the APK

**Was:** *"After the patch, `res/values/*.xml` contains zero CJK characters …
the default resource set is now English."*

**Actually:** the distributed English build's `resources.arsc` is **byte-identical
to the vendor one** — same SHA-256 (`1AAE7808…996EFB`), same 4,047,564 bytes.
Nothing in `res/values` changed in the shipped binary; `build2.log` even records
*"AndroidManifest.xml and resources have not changed"* (apktool reused its
cached resource binary). The translated `values/` tree existed on disk but was
never compiled into the APK.

Separately, the claim "zero CJK in `res/values`" was true only of the
intermediate tree, and only because it had been filled from the generated
`values-en` described in Correction 1.

## Correction 3 — the bundle was not actually translated to English

**Was:** router UI strings such as `无线设置` / `无线设备接入控制` / `上网方式设置`
"were translated in the patched build".

**Actually:** the shipped `business.bundle` still contains **1,711 string
literals with CJK (32,220 CJK code points)** and **2,285 mangled hybrids** —
word-substituted fragments like `none线` (无线), `middle继` (中继),
`至少选middleonesky`, `上网Equipment`. Device screenshots from the shipped build
show `本机` next to `All equipment`, `Equipment`, `2 connected terminals`.
So the build is a Chinese/English hybrid, not an English build.

Also important for anyone redoing this: the correct translation **base** is the
vendor bundle (`business.bundle.orig`, 5,067,583 B, 45,306 CJK code points),
**not** the mangled 5,260,747 B bundle. Translating the mangled one translates
damage.

## Correction 4 — provenance of the base APK

**Was:** *"The `base.apk` this work is based on is debug-signed (`CN=Android
Debug`, 9d66c6d6…)."*

**Actually:** `tplink-orig.apk` (165,025,876 B) is signed with **TP-Link's real
release certificate**:
`OU=TP-LINK Mobile, O=TP-LINK, L=ShenZhen, ST=GuangDong, C=cn`,
SHA-256 `58a50741c13a7d715c8042956c21fdfe3b8cb6429b970bd96cf0f87c7b115750`.
The `CN=Android Debug / 9d66c6d6…` certificate belongs to the **prior modified
build**, which had been re-signed with this machine's standard debug keystore.

## Correction 5 — the missing blocker: the app verifies its own signature

Not previously documented, and it is the reason a correctly translated build
still cannot start.

`com.tplink.ipc` checks its own signing certificate at startup
(resources `apk_sign_check_fail_tips` / `apk_sign_go_download`; the failure
dialog reads *"初始化失败 / 您的TP-LINK物联没有被正确安装，请尝试下载最新安装包后重新安装"*).
Any re-signed APK fails this check. Proven, in order:

| Build | Content | Result |
|---|---|---|
| vendor APK, byte-identical, only re-signed (debug key) | none | **fails** |
| vendor APK + machine's standard debug key (`9d66c6d6…`, same cert the working old build used) | none | **fails** |
| vendor APK with only the plugin container replaced | plugin | **fails** |
| vendor APK with only `sdk.bundle` replaced | sdk | **fails** |

Since the no-content-change re-sign fails, the trigger is the signature, not the
translation. The old 2026-10-20 build *did* run while debug-signed, so it must
carry a bypass of this check that a fresh rebuild does not have. **Any future
attempt must locate and re-apply that bypass** (search `getPackageInfo` /
`GET_SIGNATURES` / `signatures` / `apk_sign_check_fail_tips` in smali), or the
app will always stop at the initialization dialog.

**Resolution (2026-10-26):** in practice this is worked around by using the
**prior debug-signed build as the base** — its recompiled dex already carries
whatever lets startup proceed, and its `resources.arsc` is already English. The
English router UI, dashboard, settings and firmware page all run from that base
with the new `business.bundle`/`sdk.bundle` grafted in. Porting the bypass to a
clean vendor base (smali diff, see `docs/app-localization.md` §5) remains open,
and is only needed to redo the build from scratch rather than from the old APK.

## Correction 6 — the router plugin is a custom container with a checksum

Also new, and needed by anyone rebuilding the plugin:

```
[0..176)    44 x big-endian u32 header
              u[6]=176        description.zip offset
              u[7]=len(desc)  description.zip length
              u[8]=735        trailer offset
              u[9]=22         trailer length (empty ZIP EOCD)
              u[10]=757       main ZIP offset
              u[11]=len(zip)  main ZIP length
[176..735)  description.zip -> describe.json (plugin metadata)
[735..757)  22-byte empty ZIP EOCD
[757..EOF)  main ZIP, 326 entries, entry "business.bundle"
```

`describe.json` contains **`bundleMd5`**, the MD5 of `business.bundle`. Patch the
bundle without updating this and the plugin fails consistency. Patch the ZIP
without updating `u[11]` and the loader reads the wrong length. Both are real,
observed failure modes (see `docs/app-localization.md`). Tools for this are in
`tools/rebuild-plugin-bin.py` and `tools/fix-plugin-bin.py`.

## What is still Chinese, and why (corrected)

- The **pinyin character-dictionary data tables** inside `sdk.bundle`
  (`WordToPinDictionary`): ~1,020 literals / 6,353 code points. These are data
  used for pinyin/IME logic, not UI; they must stay Chinese.
- **Camera/NVR/cloud pages** (the 17.7 MB `android-TPP_GENERAL_MODULE` Vue app)
  are out of scope for a router-only build and were left untranslated.
- **Chinese voice prompts** in `assets/audios/*.g711` are audio, not text.
- Router-supplied strings, if any, would still come from the router's own
  Chinese-only language pack (`/web-static/language/cn/str.js`).

## Method that does work (for the next attempt)

1. Base: `tplink-orig.apk` (vendor, Chinese).
2. Resources: `apktool d --no-src` → translate `res/values/{strings,arrays,plurals}.xml`
   + `values-zh` → `apktool b --copy-original`. Verified: 32,316 resource IDs
   unchanged, manifest byte-identical, `resources.arsc` CJK 92,381 → 0.
3. Bundles: translate from the **vendor** bundle, then patch
   `business.bundle` + `describe.json.bundleMd5` + container `u[11]`.
4. **Bypass the signature check** (the missing step).
5. Package: replace only the two assets in a byte-preserving repack, zipalign,
   sign, install, verify on device.
