#!/usr/bin/env node
/**
 * fix-cache.mjs — clean up the raw translation cache before it is applied.
 *
 *  1. Residual Chinese. Google echoes the tail of very long paragraphs. Only
 *     real UI prose is retried (source contains sentence punctuation, length
 *     sane). Entries that are CJK character CATALOGUES — the pinyin
 *     WordToPinDictionary data tables in sdk.bundle, which are data and not UI —
 *     are left alone and allowlisted, because "translating" them would destroy
 *     the pinyin tables.
 *  2. Placeholder parity: a format token present in the English but ABSENT from
 *     the Chinese is removed (that direction can throw at format time). `%%` is
 *     masked before scanning so "%% is checking" is not misread as "% i".
 *  3. Short single-word labels get a capital first letter ("account" -> "Account").
 *
 * Writes cache.json in place, plus fix-report.json and cache-clean.flag.
 */
import fs from "node:fs";

const ROOT = "C:/Users/o0o/Documents/deepseek-harness/default-workspace/tl-en";
const CACHE = ROOT + "/cache.json";
const CJK = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const UA = { "User-Agent": "Mozilla/5.0" };

// Format specifiers, with %% masked out first (Android only interprets %% when formatted).
function specs(s) {
  const masked = s.replace(/%%/g, "\u0000");
  return masked.match(/%(?:\d+\$)?[-+# 0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[diouxXeEfFgGcs]/g) || [];
}

async function tr(q) {
  const url = "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=zh-CN&tl=en&q=" + encodeURIComponent(q);
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  const out = Array.isArray(j) ? (typeof j[0] === "string" ? j[0] : (j[0] || []).join("")) : "";
  if (!out) throw new Error("bad shape");
  return out.trim();
}

const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
const report = { total: Object.keys(cache).length, residualFixed: [], dataAllowlist: [], residualLeft: [], phRemoved: [], capitalised: 0 };

// ---- 1. residual Chinese ------------------------------------------------
const isProse = (zh) => zh.length <= 600 && /[。！？，；：、]/.test(zh);
const residual = Object.entries(cache).filter(([, v]) => CJK.test(v));
console.log(`entries with residual CJK: ${residual.length}`);

for (const [zh, en] of residual) {
  if (!isProse(zh)) {
    report.dataAllowlist.push({ zh: zh.slice(0, 50), len: zh.length, reason: "CJK character catalogue / data table, not UI" });
    continue;
  }
  const tailMatch = en.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF][^A-Za-z]*$/);
  let fixed = null;
  try {
    if (tailMatch) {
      const tail = tailMatch[0];
      const tailEn = await tr(tail);
      const candidate = (en.slice(0, en.length - tail.length) + tailEn).trim();
      if (!CJK.test(candidate)) fixed = candidate;
    }
    if (!fixed) {
      const parts = zh.split(/(?<=[。！？；\n])/).filter((s) => s.trim());
      const out = [];
      for (const p of parts) {
        const t = await tr(p);
        if (CJK.test(t)) throw new Error("segment still CJK");
        out.push(t);
      }
      fixed = out.join(" ").trim();
    }
  } catch {
    fixed = null;
  }
  if (fixed && !CJK.test(fixed)) {
    cache[zh] = fixed;
    report.residualFixed.push({ zh: zh.slice(0, 50), before: en.slice(0, 90), after: fixed.slice(0, 110) });
  } else {
    report.residualLeft.push(zh.slice(0, 70));
  }
}

// ---- 2. placeholder parity ---------------------------------------------
for (const [zh, en] of Object.entries(cache)) {
  const zhSet = new Set(specs(zh));
  const enSpecs = specs(en);
  if (!enSpecs.length) continue;
  let fixed = en;
  let removed = 0;
  for (const tok of enSpecs) {
    if (!zhSet.has(tok)) { fixed = fixed.replace(tok, ""); removed++; }
  }
  // Only tidy up if something was actually removed. Never touch the rest:
  // collapsing whitespace here destroys intentional \n\n blank lines in
  // multi-line dialog bodies.
  if (removed) {
    fixed = fixed.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim();
  }
  if (fixed !== en) {
    cache[zh] = fixed;
    report.phRemoved.push({ zh: zh.slice(0, 50), before: en.slice(0, 90), after: fixed.slice(0, 90) });
  }
}

// ---- 3. capitalise short labels ----------------------------------------
for (const [zh, en] of Object.entries(cache)) {
  if (/^[A-Za-z0-9%]/.test(zh)) continue; // fragment that starts with ASCII: leave casing alone
  if (zh.length > 4) continue;
  if (/[。！？，,.:;；!?…]$/.test(zh.trim())) continue;
  if (/^[%<]/.test(en)) continue;
  if (!/^[a-z][a-z'-]*$/.test(en)) continue;
  cache[zh] = en[0].toUpperCase() + en.slice(1);
  report.capitalised++;
}

fs.writeFileSync(CACHE, JSON.stringify(cache));
report.summary = {
  total: report.total,
  residualFixed: report.residualFixed.length,
  dataAllowlist: report.dataAllowlist.length,
  residualLeft: report.residualLeft.length,
  phRemoved: report.phRemoved.length,
  capitalised: report.capitalised,
  stillCjkAfter: Object.values(cache).filter((v) => CJK.test(v)).length,
};
fs.writeFileSync(ROOT + "/fix-report.json", JSON.stringify(report, null, 1));
fs.writeFileSync(ROOT + "/cache-clean.flag", String(Date.now()));
console.log(JSON.stringify(report.summary, null, 1));
if (report.residualLeft.length) console.log("left:", report.residualLeft);
if (report.phRemoved.length) console.log("ph removed:", report.phRemoved);
