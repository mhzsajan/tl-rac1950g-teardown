# Changelog

All builds are for `com.tplink.ipc` **5.15.22.2003** (versionCode 515222003,
minSdk 28, targetSdk 30) on a **TL-RAC1950G 易展版** (AC1950 EasyMesh, firmware
2.0.16 / satellite 2.0.12).

Scope of these builds: **local router management in English**, no TP-LINK ID,
no account binding, no cloud. Camera/NVR/cloud surfaces are not part of the
target (and are stripped from the slim build).

---

## [1.1.0] — 2026-10-26

Cosmetic and UX pass on the first working build. Same app, same behaviour; the
visible text and one noisy toast are fixed.

### Fixed
- **Native resources are now actually English.** The 1.0.x arm was built on a
  base whose `resources.arsc` was still Chinese (92,351 CJK code points) — the
  English came only from the React Native bundles. The translated
  `res/values/*.xml` is now compiled into the APK: `resources.arsc` CJK
  → ~0, verified with `aapt2 dump strings`.
- **Stale `res/values-en/` removed.** That config carried the earlier
  word-substitution wording and, because the phone locale is English, it
  silently *overrode* the translated defaults. This was why "All equipment"
  survived the first rebuild.
- **Wording corrected** (literal-only edits, bundle syntax validated with
  `node --check`):
  | before | after |
  |---|---|
  | All equipment | All devices |
  | Equipment (tab) | Device |
  | Unbound device | Unbound devices |
  | Management router | Manage router |
  | forget the password | Forgot password |
  | wireless timing | Wireless schedule |
  | network management | Network management |
  | 2 connected terminals | 2 connected devices |
  | main route | main router |
- **"Device system error!" toast muted.** That toast is router API error code
  `40101`, raised on the device and More settings pages when an optional data
  request fails. It is noise, not a failure. The single toast call site
  (`NativeModules.TRNDialogAndroid.showToast`) is now guarded so only that one
  message is suppressed; every other toast still works.

### Verified on device (SM-S908E, gateway 192.168.0.1, router "Main" + node "Kitchen")
- first-run consent → home → local admin login → dashboard → More settings →
  Router software upgrade → Wireless settings: all English, **0 CJK** on dumps
- no error pop-up on device / More settings pages
- firmware page reads "Upgrade your router … Current software version: V2.0.16"
  (Main) / "V2.0.12" (Kitchen), "Check for updates"
- local-only use confirmed: TP-LINK ID prompt answered "Not yet", router managed
  without an account

### Artifacts
| file | size | sha256 |
|---|---|---|
| `tplink-router-en-full.apk` | 163.8 MB | `ae0e79e8abc917a09bdacea425ee29ec9b8d45c1cae1b1dc6dda1849cc5909fe` |
| `tplink-router-en-slim.apk` | 99.2 MB | `10f0877b9d38a68a0eb5d4e25ab9bbcab7530fc798c74211906b23f8bb661ba3` |

Slim removes payloads a router-only user never touches: the camera/NVR Vue
module (17.7 MB), 4 AI models (25.6 MB), camera chime audio, 32-bit native libs
(55.7 MB) and the plugin market. Dex, resources, manifest and the router plugin
container are untouched.

### Known limitations
- A few router-page labels (`网络管理`, `%d台路由组网`, …) are **not in the APK**
  — they are supplied by the router, whose only language pack is Chinese.
- Debug-signed (`364e722d…`), so it cannot be installed over the vendor build;
  uninstall `com.tplink.ipc` first.
- Static plural forms remain for edge counts ("1 devices").

---

## [1.0.0] — 2026-10-26

First working English build.

### Added
- Full translation of the router UI: `business.bundle` CJK 45,306 → 22 code
  points (only regex character classes), `sdk.bundle` left with the pinyin
  data tables only (deliberate — they are data, not UI).
- Plugin container rebuilt correctly: `describe.json.bundleMd5` updated to the
  patched bundle, header `u[11]` (main-ZIP length) corrected, description
  section + trailer preserved. Earlier attempts failed plugin init because
  those fields were stale.
- Stripped router-only variant (166.4 → 99.7 MB).

### Verified on device
- consent dialog, home, admin login, dashboard, settings, firmware page:
  English, 0 CJK on the RN surfaces.

### Known limitations
- Native `resources.arsc` still Chinese → mixed language on some screens,
  and the earlier word-substitution wording ("All equipment") still visible
  where the English-locale resource overrode the defaults. Fixed in 1.1.0.
- "Device system error!" toast on device / More settings pages. Fixed in 1.1.0.

### Artifacts
| file | size | sha256 |
|---|---|---|
| `tplink-router-en-full.apk` | 166.4 MB | `411e1c1a5a1f0a02e169dea59564410eb229e033deec26a8372dd0e9942445be` |
| `tplink-router-en-slim.apk` | 99.7 MB | `eeb58e68f5c69f72749e8c418ecf74e2dcc2a014607ef9e03b2638818a92d97a` |

---

## Reference

### `tplink-ipc-5.15.22.2003-original.apk` — 157.4 MB, sha256 `2bf2ad9811a5c3b16745cdb1425fc9ec7cff636d3211482f806cd60b4afdff85`
The **unmodified vendor APK** as pulled from the device, kept only for
comparison. Signed with TP-Link's release certificate
(`OU=TP-LINK Mobile, O=TP-LINK, L=ShenZhen, ST=GuangDong, C=cn`,
`58a50741c13a7d715c8042956c21fdfe3b8cb6429b970bd96cf0f87c7b115750`).
Not installable alongside the English builds (different signer), and it is
Chinese-only.

Why the English builds are *not* built from this APK: `com.tplink.ipc` verifies
its own signing certificate at startup, so **any** re-signed copy of the vendor
APK stops at "Initialization failed". The English builds are derived from an
earlier debug-signed build whose code already passes that check; its resources
and bundles are then replaced. That is why the APKs are reproductions of a
working modification path rather than clean rebuilds from the vendor binary.
