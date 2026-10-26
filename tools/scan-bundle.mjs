#!/usr/bin/env node
/**
 * scan-bundle.mjs — count CJK text in a React Native / JS bundle, correctly.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCRIPT EXISTS (read before trusting a zero)
 * ---------------------------------------------------------------------------
 * Metro — the React Native bundler — escapes every non-ASCII code unit in a
 * string literal as `\uXXXX`. A bundle full of Chinese therefore contains no
 * literal CJK bytes at all, and a naive scan (`text.match(/[\u4e00-\u9fff]/g)`)
 * returns 0.
 *
 * That zero is a false negative, and it is expensive: it reads as "the bundle
 * holds no Chinese, so the Chinese must come from somewhere else", which sends
 * you looking at the router or at Android resources for text that was in the
 * bundle the whole time.
 *
 * So this script decodes `\uXXXX` escapes before counting, and reports both
 * numbers side by side. `rawCjk` is the wrong number. `cjkChars` is the answer.
 * If you only read one field, read `cjkChars`.
 *
 * It also reports an ASCII sanity count, so a genuine zero can be told apart
 * from a scan that read the wrong file or a binary blob.
 *
 * Usage:
 *   node scan-bundle.mjs <dir-or-file> [more...]
 *   node scan-bundle.mjs --literals <dir-or-file>   # also dump unique CJK literals
 *
 * Exits 0 always; read the JSON on stdout.
 */

import fs from "node:fs";
import path from "node:path";

const CJK_RANGES =
  /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;
const CJK_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const ESCAPE = /\\u([0-9a-fA-F]{4})/g;

// Labels commonly seen in the TP-Link China router UI. Edit for your device.
const DEFAULT_KEYWORDS = [
  "路由设置", "上网设置", "无线设置", "设备管理", "网络状态",
  "软件升级", "管理员密码", "主人网络", "已连设备", "访客网络",
  "桥模式", "恢复出厂", "IP与MAC绑定", "上网时间",
  "网络拓扑", "本机", "连接设备", "无线设备接入控制", "重启路由器",
];

const EXTS = new Set([".bundle", ".js", ".json", ".arsc", ".xml", ".html", ".css", ".txt"]);

/** Decode every `\uXXXX` escape in a string. This is the whole point. */
function decodeEscapes(s) {
  return s.replace(ESCAPE, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  for (;;) {
    const j = haystack.indexOf(needle, i);
    if (j === -1) return n;
    n++;
    i = j + needle.length;
  }
}

/**
 * Pull quoted JS string literals out of a bundle.
 * Handles "…", '…' and `…` with backslash escapes. Not a JS parser — good
 * enough for Metro output, and it is only used to attribute text to literals.
 */
function stringLiterals(text) {
  const out = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(text))) {
    const body = m[1] ?? m[2] ?? m[3];
    if (body) out.push(body);
  }
  return out;
}

function scanFile(file, keywords, wantLiterals) {
  const buf = fs.readFileSync(file);
  const text = buf.toString("utf8");
  const decoded = decodeEscapes(text);

  // The wrong number, kept on purpose so the difference is visible.
  const rawCjk = (text.match(CJK_CHAR) || []).length;

  // The right number.
  const cjkChars = (decoded.match(CJK_CHAR) || []).length;
  const uniq = new Set();
  for (const ch of decoded) if (CJK_RANGES.test(ch)) uniq.add(ch);

  const escapes = (text.match(ESCAPE) || []).length;
  let cjkEscapes = 0;
  ESCAPE.lastIndex = 0;
  let e;
  while ((e = ESCAPE.exec(text))) {
    const cp = parseInt(e[1], 16);
    if (cp >= 0x3400 && cp <= 0x9fff) cjkEscapes++;
  }

  // CJK-bearing string literals — the unit you actually translate.
  const literals = new Set();
  for (const lit of stringLiterals(text)) {
    const d = decodeEscapes(lit);
    if (CJK_RANGES.test(d)) literals.add(d);
  }

  const samples = [...literals]
    .filter((s) => s.length >= 2 && s.length <= 60)
    .slice(0, 40);

  const hits = {};
  for (const k of keywords) {
    const c = countOccurrences(decoded, k);
    if (c > 0) hits[k] = c;
  }

  const result = {
    bytes: buf.length,
    // Correct instrument: escapes decoded first.
    cjkChars,
    cjkUniq: uniq.size,
    cjkLiterals: literals.size,
    // The trap: this is 0 in a bundle that is full of Chinese.
    rawCjk,
    escapes,
    cjkEscapes,
    keywordHits: hits,
    samples,
    // Sanity: if these are 0 too, the file is binary or the scan is wrong.
    sanity: {
      router: countOccurrences(decoded, "router"),
      http: countOccurrences(decoded, "http"),
      function: countOccurrences(decoded, "function"),
    },
  };

  if (wantLiterals) result.literals = [...literals].sort();
  return result;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (EXTS.has(path.extname(entry.name).toLowerCase())) out.push(p);
  }
  return out;
}

let args = process.argv.slice(2);
let wantLiterals = false;
if (args[0] === "--literals") {
  wantLiterals = true;
  args = args.slice(1);
}
if (args.length === 0) {
  console.error("usage: node scan-bundle.mjs [--literals] <dir-or-file> [more...]");
  process.exit(2);
}

const keywords = DEFAULT_KEYWORDS;
const report = {
  note:
    "rawCjk counts literal UTF-8 CJK bytes and is WRONG for Metro bundles. " +
    "Use cjkChars, which decodes \\uXXXX escapes first.",
  keywords,
  files: {},
};

for (const d of args) {
  if (!fs.existsSync(d)) {
    report.files[d] = { error: "not found" };
    continue;
  }
  const targets = fs.statSync(d).isDirectory() ? walk(d) : [d];
  for (const f of targets) {
    try {
      report.files[f] = scanFile(f, keywords, wantLiterals);
    } catch (err) {
      report.files[f] = { error: String(err.message || err) };
    }
  }
}

process.stdout.write(JSON.stringify(report, null, 2) + "\n");
