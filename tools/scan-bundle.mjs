#!/usr/bin/env node
/**
 * scan-bundle.mjs — measure whether a React Native / JS bundle carries any CJK text.
 *
 * Purpose: when a UI shows Chinese but the app's own code contains none, the strings
 * are being resolved at runtime (Android resources or a remote device). This script
 * distinguishes "no CJK present" from "the scan is broken" by also reporting an
 * ASCII sanity count.
 *
 * Usage:
 *   node scan-bundle.mjs <dir> [more-dirs...]
 *
 * Exits 0 always; read the JSON on stdout.
 */

import fs from "node:fs";
import path from "node:path";

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff][\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f A-Za-z0-9]{1,30}/g;

// Labels commonly seen in the TP-Link China router UI. Edit for your own device.
const DEFAULT_KEYWORDS = [
  "路由设置", "上网设置", "无线设置", "设备管理", "网络状态",
  "软件升级", "管理员密码", "主人网络", "已连设备", "访客网络",
  "桥模式", "恢复出厂", "IP与MAC绑定", "上网时间",
];

// Extensions worth scanning. Everything else is skipped.
const EXTS = new Set([".bundle", ".js", ".json", ".arsc", ".xml", ".html", ".css"]);

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

function scanFile(file, keywords) {
  const buf = fs.readFileSync(file);
  const text = buf.toString("utf8");

  let cjkChars = 0;
  const uniq = new Set();
  for (const ch of text) {
    if (CJK.test(ch)) {
      cjkChars++;
      if (uniq.size < 5000) uniq.add(ch);
    }
  }

  const samples = [];
  const seen = new Set();
  let m;
  CJK_RUN.lastIndex = 0;
  while ((m = CJK_RUN.exec(text)) && samples.length < 40) {
    const s = m[0].trim();
    if (s.length >= 2 && !seen.has(s)) {
      seen.add(s);
      samples.push(s);
    }
  }

  const hits = {};
  for (const k of keywords) {
    const c = countOccurrences(text, k);
    if (c > 0) hits[k] = c;
  }

  return {
    bytes: buf.length,
    cjkChars,
    cjkUniq: uniq.size,
    samples,
    keywordHits: hits,
    // Sanity: if these are 0 too, the file is probably binary or the scan is wrong.
    sanity: {
      "router": countOccurrences(text, "router"),
      "http": countOccurrences(text, "http"),
      "function": countOccurrences(text, "function"),
    },
  };
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (EXTS.has(path.extname(entry.name).toLowerCase())) out.push(p);
  }
  return out;
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("usage: node scan-bundle.mjs <dir> [more-dirs...]");
  process.exit(2);
}

const keywords = DEFAULT_KEYWORDS;
const report = { keywords, files: {} };

for (const d of dirs) {
  if (!fs.existsSync(d)) {
    report.files[d] = { error: "not found" };
    continue;
  }
  const targets = fs.statSync(d).isDirectory() ? walk(d) : [d];
  for (const f of targets) {
    try {
      report.files[f] = scanFile(f, keywords);
    } catch (e) {
      report.files[f] = { error: String(e.message || e) };
    }
  }
}

process.stdout.write(JSON.stringify(report, null, 2) + "\n");
