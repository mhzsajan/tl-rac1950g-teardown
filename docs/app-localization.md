# `com.tplink.ipc` — anatomy, translation method, and what actually blocks it

Everything below was measured on `com.tplink.ipc` **5.15.22.2003** (versionCode
515222003, minSdk 28, targetSdk 30), pulled from a retail **TL-RAC1950G 易展版**
(AC1950 EasyMesh). Where numbers appear they were produced by the tools in
`../tools/` against the vendor APK, not taken from earlier notes.

---

## 1. What is in the APK

| Part | Size | Role |
|---|---|---|
| `classes*.dex` ×5 | 40 MB | native/Java app: boot, account, camera, plugin manager |
| `resources.arsc` | 4.05 MB | Android strings — **Chinese only**, no `values-en` |
| `assets/rn_sdk/sdk.bundle` | 3.51 MB | React Native app shell (Metro bundle) |
| `assets/plugins/AB739671AE5E56A529_v1.16.13.1060-master.bin` | 3.01 MB | **router UI plugin** — custom container, see §4 |
| `assets/android-TPP_GENERAL_MODULE-1.0.55.bin` | 17.7 MB | camera/NVR/cloud **Vue web app** (987 files) — out of scope for a router build |
| `assets/pluginMarket/dist.zip` | 0.2 MB | plugin store (Vue) |
| `assets/*.tflite` ×4 | 25.6 MB | camera AI models |
| `assets/audios/*` | 0.9 MB | camera chime/voice audio (Chinese audio — not translatable as text) |
| `lib/arm64-v8a` + `lib/armeabi-v7a` | 56 MB each | native libs |

The router-management UI that a user actually sees lives entirely in the plugin
container's `business.bundle`. The native screens (boot, consent, account,
camera) use `resources.arsc`.

## 2. Metro escapes CJK — the zero that lies

Metro escapes every non-ASCII code unit as `\uXXXX`. A raw byte scan for CJK
therefore reports **0** on a bundle that is entirely Chinese:

| Bundle | raw CJK bytes | CJK after decoding `\uXXXX` |
|---|---|---|
| vendor `business.bundle` (5,067,583 B) | 0 | **45,306** code points, 1,865 literals |
| vendor `sdk.bundle` (3,505,805 B) | 0 | **~19,400** code points |

Always decode the escapes before counting or translating. `tools/scan.mjs`
does this and reports both numbers.

## 3. Translation results (this work)

| Surface | Before | After |
|---|---|---|
| `resources.arsc` — CJK code points | 92,381 (aapt2: 8,005 CJK values of 17,946) | **0** (17,757 values) |
| `business.bundle` — CJK code points | 45,306 | **22** (only `\u4e00-\u9fa5` inside regex character classes) |
| `sdk.bundle` — CJK code points | ~19,400 | **6,360**, all of them the pinyin `WordToPinDictionary` data tables |
| Translation cache | — | **11,849 zh→en entries**, 0 failures |

Method: Google Translate's `clients5.google.com/translate_a/t` endpoint
(~11–13 req/s, no throttling), curated overrides for short UI fragments that MT
gets wrong (`确定`→OK, `取消`→Cancel), then a clean-up pass that

- repairs residual Chinese in long prose (Google echoes paragraph tails),
- enforces format-specifier parity (removes tokens the source lacks — the
  direction that throws at runtime),
- restores multi-line `\n\n` structure,
- capitalises standalone labels,
- leaves the pinyin data tables alone on purpose.

Then a second, hand-curated pass for **`+` concatenation fragments**, which MT
mangles badly on the router screens:

| Source | Bad MT | Fixed |
|---|---|---|
| `f+"天"+h+"小时"+m+"分钟"+s+"秒"` | `3Sky5Hour2Minute1Second` | `3d 5h 2min 1s` |
| `"有"+n+"台已禁设备"` | `Have3Banned device` | `3 blocked devices` |
| `"筛选出"+n+"台AP"` | `filter out2Taiwan AP` | `Showing 2 APs` |

`天` must not become "Sky", `台` must not become "Taiwan". 193 literals / 463
occurrences needed overriding; standalone occurrences of the same strings were
left at their normal translation.

## 4. The router plugin container (custom format, reverse-engineered)

`assets/plugins/*.bin` is **not** a plain ZIP:

```
[0..176)    44 x big-endian u32 header
              u[6]=176         description.zip offset
              u[7]=len(desc)   description.zip length          (vendor: 559)
              u[8]=735         trailer offset                    (176+559)
              u[9]=22          trailer length
              u[10]=757        main ZIP offset                   (735+22)
              u[11]=len(zip)   main ZIP length                  (vendor: 3013308)
[176..735)  description.zip — one entry: describe.json
[735..757)  22-byte empty ZIP EOCD
[757..EOF)  main ZIP — 326 entries, one of them business.bundle
```

`describe.json` (702 B) is the plugin's manifest:

```json
{"id":"AB739671AE5E56A529","name":"云路由_Android","versionCode":"11613",
 "versionName":"1.16.13","buildNumber":"1060-master","appSupport":["com.tplink.ipc"],
 "platform":"ANDROID","type":"bundle","index":"tplink.rnsdk.router_index",
 "bundleMd5":"f4fb68bf09a717c5a83f0c0e357b824b", ...}
```

**Two failure modes to know:**

1. `bundleMd5` must equal the MD5 of the patched `business.bundle`. A stale value
   is a real consistency check.
2. `u[11]` must equal the actual main-ZIP length (`fileSize - 757`). Rebuild the
   ZIP to a different size and leave the vendor value, and the loader reads past
   the end (observed: `TPPluginTaskHandler` decompression error).

Tools: `tools/rebuild-plugin-bin.py` (correct way — rebuild desc + header +
ZIP consistently), `tools/fix-plugin-bin.py` (patch `u[11]` only).

Note the **prior build** shipped a container of shape `176-byte header + ZIP`
with **no** description.zip and **no** trailer — i.e. deliberately malformed —
and the app still loaded it. That tells you the loader tolerates a missing
description section; it does not tell you why that build got further (see §5).

## 5. What actually blocks a translated build: the app checks its own signature

After the first-run consent dialog, the app shows:

> **Initialization failed** — Your TP-LINK IoT is not installed correctly,
> please try to download the latest installation package and reinstall it.
> *(zh: 初始化失败 / 您的TP-LINK物联没有被正确安装…)*

Related resources: `apk_sign_check_fail_tips`, `apk_sign_go_download`.

Isolation experiments on the same device, each = uninstall → install → launch →
tap consent → dump UI:

| Build | Only change vs vendor | Result |
|---|---|---|
| `pure-resign.apk` | **nothing** (byte-identical content, re-signed with debug key) | initialization fails |
| `iso-sdk-dbgkey.apk` | `sdk.bundle` + signed with the machine debug key `9d66c6d6…` | initialization fails |
| `iso-plugin.apk` | `business.bundle` container only | initialization fails |
| `iso-sdk.apk` | `sdk.bundle` only | initialization fails |

Because a **no-content-change re-sign** fails, the trigger is the signature.
The vendor APK is signed with TP-Link's real certificate
`58a50741…` (`OU=TP-LINK Mobile, O=TP-LINK, L=ShenZhen, ST=GuangDong, C=cn`).
The old 2026-10-20 build ran while debug-signed, so it must carry a bypass of
this check that a from-scratch rebuild does not have.

**Therefore: patching this check is a hard prerequisite.** Look for
`getPackageInfo(...GET_SIGNATURES)`, `signatures`, certificate hashing, and the
`apk_sign_check_fail_tips` reference in smali; force the check true (or remove
the failure branch), rebuild dex, then build the APK as in §6.

## 6. Rebuild sequence that is proven safe (all but the signature gate)

```
# 1. resources: decode vendor, translate res/values, rebuild with aapt2
java -jar apktool.jar d tplink-orig.apk -o tree --no-src
#    (translate res/values/{strings,arrays,plurals}.xml + values-zh)
java -jar apktool.jar b tree --copy-original -o res-variant.apk
#    verified: 32,316 ids identical, 0 added/removed/renamed, manifest byte-identical,
#              resources.arsc CJK 92,381 -> 0

# 2. plugin: patched bundle + consistent describe.json + header
python rebuild-plugin-bin.py --vendor-bin vendor-plugin.bin \
    --main-zip rebuilt-326-entries.zip --bundle business.bundle.patched \
    --out plugin-final.bin

# 3. package: replace only the two asset entries, keep everything else byte-identical
python pack-apk.py --base res-variant.apk --out unsigned.apk \
    --replace "assets/plugins/AB739671AE5E56A529_v1.16.13.1060-master.bin=plugin-final.bin" \
    --replace "assets/rn_sdk/sdk.bundle=sdk.bundle.patched"

# 4. align + sign
zipalign -p -f 4 unsigned.apk aligned.apk
apksigner sign --ks debug.keystore ... --out final.apk aligned.apk

# 5. static gate
python verify_apk.py final.apk      # CJK per surface, zip integrity, bundle presence
```

`pack-apk.py` preserves each entry's original compression method, so
`resources.arsc`, dex, lib and every other resource stay untouched — no apktool
resource round-trip, hence no risk of the resource-ID renumbering that killed the
earlier attempt.

## 7. Optional stripping (for a router-only build)

`slim.py` removes payloads a router-only user never touches, and cannot affect
resource IDs or dex:

| Removed | Size |
|---|---|
| `android-TPP_GENERAL_MODULE` (camera/NVR/cloud Vue app) | 17.7 MB |
| 4 × `.tflite` AI models | 25.6 MB |
| `assets/audios/*` (camera chimes) | 0.9 MB |
| `lib/armeabi-v7a` (keep arm64) | 55.7 MB |
| `assets/pluginMarket` + HMS root CAs | 0.27 MB |

Result: 161.2 MB → **94.4 MB**. Keeps dex, `resources.arsc`, manifest, plugin
container and `sdk.bundle` intact. **Not yet device-validated** — it is gated
behind the same signature check as the full build.

## 8. Device protocol notes (they cost hours the first time)

- First launch shows a privacy **consent dialog** (`dialog_tips_title_tv` /
  `dialog_select_confirm_tv`) — the content text contains hyperlinks, so a blind
  tap opens Chrome; always `uiautomator dump` and tap by resource-id.
- Router local login: `com.tplink.tppluginmanagerexportmodule.CommonRNActivity`,
  `EditText` + `LoginButton` content-desc.
- Language-independent page markers: `MultiFreqSwitchCell` (Wi-Fi),
  `Wan1NetSettingTypeTextCell` (WAN), `ToolBaseViewSwitchCell` (access control),
  `GuestNetworkSwitchCell`, `RebootTextCell`, `WirelessSettingTextCell`,
  `AdminModifyTextCell`, `UpgradeTextCell` (firmware).
- The live gateway on site was **192.168.0.1**, not the sticker's 192.168.10.1 —
  read `ip route` instead of trusting the label.
- The old build's baseline measured **84 unique CJK strings across 16 of 20
  router screens** — that is the "before" for any comparison.

## 9. Limits of this work

- The signature check was **not** bypassed here; no fully translated build has
  yet run on the device.
- Device testing covered the consent dialog (verified English, 0 CJK) and the
  initialization gate; router screens were reached only on the **old mangled
  build**, not on this translation.
- The camera/NVR/cloud surfaces were deliberately not translated.
- Chinese voice prompts and any router-side strings remain Chinese.
- Translation quality is machine translation plus curated overrides: accurate
  and readable for UI, not editorial. Plural forms are static (`1 devices`).
