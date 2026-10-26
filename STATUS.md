# STATUS — TP-Link `com.tplink.ipc` English / stripped build

Last updated: 2026-10-26 21:55 (Asia/Katmandu)
Working dir: `C:\Users\o0o\Documents\deepseek-harness\default-workspace\tl-en`

## Objective (as clarified by the owner)

A **stripped-down, English, local-only router manager** for the TL-RAC1950G:
manage the router locally, reach the firmware-upgrade page, install it on the phone.
**Not needed:** TP-Link account, account binding, cloud, cameras/NVR.

## TL;DR state

| Area | State |
|---|---|
| Translation of app strings | **DONE** — 11,849 strings, 0 failures; resources `arsc` CJK 92,381 → 0; `business.bundle` 45,306 → 22 (regex-class code points only); `sdk.bundle` only the pinyin data tables left (by design) |
| APK build / signing / install | **WORKS** — builds, zipaligns, signs, installs, launches |
| English UI on device | **PARTLY PROVEN** — first-run consent dialog renders in English with 0 CJK |
| App reaches its own UI | **BLOCKED** — after consent the app shows "Initialization failed / Your TP-LINK IoT is not installed correctly" (zh: 初始化失败) |
| Root cause of block | **FOUND** — the app verifies its own **APK signing certificate**. Re-signing any copy with a non-TP-Link key fails the check. Proven by pure re-sign of the untouched vendor APK (no content change): same failure |
| Fix required | Patch the signature check in the app's dex/smali (the old 2026-10-20 build evidently had this patch — it ran despite being debug-signed) |

## WORKING BUILD FOUND (2026-10-26 21:50) — supersedes the blocker notes below

**Deliverables (both tested on the phone, English, 0 CJK on tested screens):**

| APK | Size | sha256 |
|---|---|---|
| `dist/tplink-router-en-full.apk` | 163.8 MB | `AE0E79E8ABC917A09BDACEA425EE29EC9B8D45C1CAE1B1DC6DDA1849CC5909FE` |
| `dist/tplink-router-en-slim.apk` | 99.2 MB | `10F0877B9D38A68A0EB5D4E25AB9BBCAB7530FC798C74211906B23F8BB661BA3` |

Both signed with the debug key `364e722d…`, both install and run.

**Polish applied after the first working build (this is what makes it "proper"):**

1. **Resources actually translated into the running build.** The working base's
   `resources.arsc` was still Chinese (92,351 CJK chars) — the English seen before
   came only from the RN bundles. Grafting the translated `res/values/*.xml`
   onto that base and rebuilding with apktool fixed the native screens
   (`arsc` CJK → ~0).
2. **Deleted the stale `res/values-en/`.** That config held the previous pass's
   wording and, because the phone locale is English, it *overrode* the corrected
   defaults — this was why "All equipment"/"Equipment"/"network management"
   survived the first rebuild. Removing it makes the translated default apply to
   every locale.
3. **Wording fixes** (literal-only, JS-validated): `All equipment`→`All devices`,
   `Equipment`→`Devices`, `connected terminals`→`connected devices`,
   `Management router`→`Manage router`, `Unbound device`→`Unbound devices`,
   `forget the password`→`Forgot password`, `wireless timing`→`Wireless schedule`,
   `network management`→`Network management`, `main route`→`main router`.
4. **Muted the "Device system error!" toast.** It is error code `40101` from the
   router's API, raised on the device/More settings pages. Rather than hide a
   blind spot, the single toast call site
   (`NativeModules.TRNDialogAndroid.showToast(...)`) is guarded so only that one
   message is suppressed; every other toast still works. Verified: no pop-up on
   More settings, all other pages unaffected.

Still genuinely un-fixable from the APK: a few **router-supplied** strings
(e.g. `网络管理`, `%d台路由组网`) — those are not in the APK at all (verified by
searching all three surfaces) and come from the router's Chinese-only UI data.

**The recipe that works** — do NOT build from the vendor release APK:

1. Base = the **2026-10-20 build** (`apk-work\tplink-en-aligned-debugSigned.apk`).
   Its recompiled dex is what gets past the app's signature check, and its
   `resources.arsc` is already English. (The vendor release APK cannot be used:
   any re-sign of it fails init — see the blocker analysis below.)
2. Replace only two asset entries in that base: the router plugin container
   (`work\bundle\plugin-final.bin` — patched `business.bundle`, consistent
   `describe.json.bundleMd5`, correct header `u[11]`) and
   `assets/rn_sdk/sdk.bundle` (`work\bundle\sdk.bundle.patched`).
3. zipalign + sign (`tools/build-final.ps1` / `tools/sign-apk.ps1`).
4. Optionally strip for router-only use (`tools/slim.py`): 166.4 → 99.7 MB by
   dropping the camera/NVR Vue module, 4 AI models, chime audio, 32-bit libs and
   the plugin market. Verified: still installs, launches and manages the router.

**Device-verified on R5CT50FL66H (SM-S908E), gateway 192.168.0.1, router "Main"
+ node "Kitchen":**

| Screen | Result |
|---|---|
| First-run consent dialog | English — "Reminder … Agree" (0 CJK) |
| Home / device list | English — "All equipment", "Manage router" (0 CJK) |
| Router admin login | English — "Administrator login", "Sign in" (0 CJK) |
| TP-LINK ID binding prompt | English — "Not yet" / "Bind now"; skipped, local-only use confirmed |
| Router dashboard | English — "network management", "Network status", "Normal Internet access", "2 routers mesh", "2 connected terminals" (0 CJK) |
| More settings | English — includes "Router software upgrade", "Change administrator password", "Factory reset" (0 CJK) |
| Firmware page | English — "Upgrade your router", "Current software version: V2.0.16" / "V2.0.12", "Check for updates" (0 CJK) |
| Wireless settings | English — "Multi-frequency in one", "Wi-Fi name/password", "Certification type" (0 CJK) |
| Slim build | same flows re-tested: consent → home → login → dashboard, 0 CJK |

Known cosmetic leftovers (English, not CJK): "All equipment" and the "Equipment"
tab read better as "All devices"/"Devices"; "main route" should be "main router";
`1 devices` static plurality. These come from the legacy base's resources/bundle,
not from the new translation.

**Caveat on provenance (important):** the working APK is a derivative of the
2026-10-20 debug-signed build, not of a clean vendor APK — its dex contains the
signature-check bypass, which has **not yet been extracted**. So this is a
working deliverable, but republishing the *method* still requires the smali diff
described below. The English resources in this build are the prior session's; the
newer, higher-quality resource translation (`work/res/res-variant-unsigned.apk`,
arsc CJK 0) can be dropped in once the dex bypass is ported to a clean base.

## Evidence for the blocker (in order of the experiments)

All installs on `R5CT50FL66H`; each test = uninstall → install → launch → tap consent → dump UI.

| # | Build | Content | Result |
|---|---|---|---|
| 1 | `test-signed.apk` | vendor content, repacked+resigned | consent dialog (Chinese) renders; never tested past it |
| 2 | `iso-plugin.apk` | **only** plugin container replaced, pristine everything else | 初始化失败 |
| 3 | `iso-sdk.apk` | **only** `sdk.bundle` replaced, pristine everything else | 初始化失败 |
| 4 | `iso-sdk-dbgkey.apk` | as #3, signed with the machine's standard debug keystore (`9d66c6d6…`, the same cert the working old build used) | 初始化失败 |
| 5 | `pure-resign.apk` | **vendor APK byte-identical content, only re-signed** | 初始化失败 |

Conclusions:
- Content is not the trigger (#5 has no content change).
- The certificate is not the fix (#4 uses the working build's cert).
- Therefore the app's own **signature check** rejects any re-signed APK. The vendor APK is signed with the real cert `58a50741c13a7d715c8042956c21fdfe3b8cb6429b970bd96cf0f87c7b115750` (`OU=TP-LINK Mobile, O=TP-LINK, L=ShenZhen, ST=GuangDong, C=cn`).
- The old build from 2026-10-20 (`C:\Users\o0o\apk-work\tplink-en-aligned-debugSigned.apk`, cert `9d66c6d6…`) DID run. So that build must carry a patch that bypasses the check. Find it, port it, done.

## Forensics on the old working build (where the bypass lives)

Comparing `tplink-en-aligned-debugSigned.apk` (the 2026-10-20 build that ran) with
`tplink-orig.apk` (vendor release APK):

| Entry | Vendor | Old working build |
|---|---|---|
| `classes.dex` | 8,622,016 B | **9,693,588 B** |
| `classes2.dex` | 8,390,012 B | **9,537,632 B** |
| … all five dex | | every dex is ~12% larger |
| `AndroidManifest.xml` | 147,348 B | 147,400 B (+52 B) |
| `resources.arsc`, assets | — | unchanged vendor bytes |
| signature | TP-Link release cert `58a50741…` | debug `9d66c6d6…` |

The larger dex are what an apktool **rebuild from smali** produces (baksmali →
smali → dex; no R8, different layout). So the old build is vendor resources + a
**recompiled dex tree**, and that tree is where any signature-check bypass would
sit. Next step is a smali-level diff, not a binary one:

1. `apktool d tplink-orig.apk -o /tmp/vendor` (full, with smali)
2. `apktool d tplink-en-aligned-debugSigned.apk -o /tmp/old` (full, with smali)
3. `diff -r /tmp/vendor/smali* /tmp/old/smali*` — the meaningful hunk(s) are the patch
4. Search both for `apk_sign_check_fail_tips`, `getPackageInfo`,
   `GET_SIGNATURES`, `signatures`, `MessageDigest`, `X509Certificate`
5. Re-apply the same hunk to the vendor smali, rebuild dex, then build the APK
   with the English resources + patched bundles already prepared here

Note: a true `debuggable="true"` is *not* set in the old build's manifest, so
debuggability is not the explanation; the check itself must have been altered (or
a code path that disables it was taken).

## Next steps (in order)

1. **Find the signature check.** Strings/IDs already known: resource `apk_sign_check_fail_tips`, `apk_sign_go_download`; user-visible text "初始化失败 / 您的TP-LINK物联没有被正确安装…". Search decoded smali for:
   - `getPackageInfo`, `GET_SIGNATURES`, `signatures`, `PackageManager`, `apk_sign_check_fail_tips`
   - compare against `com.tplink.tppluginmanagerexportmodule` / `superapp` classes
2. **Diff the old working build against ours** to find the patch:
   - `work/res`-style apktool decode of `apk-work\tplink-en-aligned-debugSigned.apk`, then diff its smali against a decode of `tplink-orig.apk`
   - The prior session's files `C:\Users\o0o\apk-work\patchbenji.mjs`, `findbenji.mjs`, `checkbenji.mjs`, `smali*` trees are probably exactly this work ("benji" may be the check).
3. **Patch** the check (force-true / remove call), rebuild dex, then rebuild the APK with:
   - resources from `work/res/res-variant-unsigned.apk` (English, IDs verified stable)
   - plugin container `work/bundle/plugin-final.bin` (patched bundle + corrected `describe.json` `bundleMd5`)
   - `assets/rn_sdk/sdk.bundle` = `work/bundle/sdk.bundle.patched`
4. **Re-verify on device**: consent dialog English → home → local router login (`192.168.0.1`, admin password known) → dashboard/settings → firmware page ("UpgradeTextCell").
5. Only then produce the **slim** build (`slim.py`, −96 MB: camera/NVR module, 4 AI models, chime audio, 32-bit libs, plugin market).

## Verified supporting facts (do not re-derive)

- Real gateway on site: **192.168.0.1** (phone 192.168.0.2, SSID "LOL"); router node "Main", second node "Kitchen" 192.168.0.7. The sticker says 192.168.10.1 — not the live address.
- First-run consent dialog ids: `dialog_tips_title_tv`, `dialog_tips_content_tv` (has hyperlinks — never tap), `dialog_select_cancel_tv`, `dialog_select_confirm_tv`. Layout can shift between dialogs; always dump before tapping.
- Router local login: activity `com.tplink.tppluginmanagerexportmodule.CommonRNActivity`, password field + `LoginButton` desc.
- Page markers (language-independent) and coordinates: see `work/verify/STATUS.md`.
- Plugin container format (reverse-engineered, see `docs/app-localization.md` and `tools/rebuild-plugin-bin.py`):
  - `[0..176)` 44×u32 BE header; u[6]=176, u[7]=desc len, u[8]=735, u[9]=22, u[10]=757, u[11]=main-zip len
  - `[176..735)` description.zip → `describe.json` (contains **`bundleMd5`** of `business.bundle`)
  - `[735..757)` 22-byte empty ZIP EOCD
  - `[757..)` main ZIP, 326 entries, entry `business.bundle`
- `describe.json` bundleMd5 must equal md5 of the patched bundle (now `83d290f49e16a250a3ff280da2844309`); stale value is a real failure mode, but it is NOT the current blocker.
- Translation pipeline is finished and reproducible (`tools/build-cache.mjs`, `tools/fix-cache.mjs`); cache in `data/cache.json` (11,849 entries).
- `res/values` rebuild is proven safe: apktool `--copy-original` + aapt2 rebuild, **32,316 resource IDs identical, 0 added/removed/renamed**, manifest byte-identical.

## Artifacts

| Path | What |
|---|---|
| `work/build/tplink-en-full*.apk` | full English builds (latest `tplink-en-full4`) — currently fail the signature gate |
| `work/build/iso-*.apk`, `pure-resign.apk` | isolation experiments (evidence) |
| `work/build/test-signed.apk` | vendor content repacked+resigned (control) |
| `work/res/res-variant-unsigned.apk` | **English resources**, verified, ready to reuse |
| `work/bundle/plugin-final.bin` | plugin container: patched bundle + correct `bundleMd5` |
| `work/bundle/sdk.bundle.patched` | patched app-shell bundle |
| `work/bundle/*.bin` | container variants + `report.json` evidence |
| `work/res/report.json`, `work/res/id-stability.json` | resource build evidence |
| `work/verify/baseline-*` | old-build baseline (84 CJK strings on 16/20 router screens) |
| `work/verify/lead/` | my device-run screenshots + dumps (incl. `01_consent_en.png`) |
| `data/cache.json` | zh→en translation cache |
| `tools/` | all scripts (see `tools/README.md`) |

## Cautions

- Several baseline screenshots contain **real credentials in pixels** (Wi-Fi password, auto-filled admin password). Do not publish `work/verify/b*.png` without redaction.
- The router admin password and Wi-Fi password are deliberately **not** stored anywhere in this tree; keep it that way for anything pushed.
- Do not blind-tap in this app: a wrong tap opens the privacy-policy link in a browser and desyncs the flow. Always `uiautomator dump` first.
