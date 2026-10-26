#!/usr/bin/env node
/**
 * repair-lines.mjs — restore line structure in multi-line translations.
 *
 * The placeholder-parity pass in an earlier fix-cache run collapsed blank lines
 * ("\n\n" -> " ") in a handful of multi-line dialog bodies. This re-translates
 * any entry whose newline COUNT differs between the Chinese source and the
 * English, working line by line so the original line breaks (including blank
 * lines) are reproduced exactly.
 */
import fs from "node:fs";

const ROOT = "C:/Users/o0o/Documents/deepseek-harness/../default-workspace/tl-en".replace("/../", "/");
const CACHE = "C:/Users/o0o/Documents/deepseek-harness/default-workspace/tl-en/cache.json";
const UA = { "User-Agent": "Mozilla/5.0" };

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
const countNl = (s) => (s.match(/\n/g) || []).length;

const bad = Object.entries(cache).filter(([zh, en]) => countNl(zh) !== countNl(en));
console.log(`entries with mismatched line counts: ${bad.length}`);

let fixed = 0, failed = 0;
for (const [zh, en] of bad) {
  const lines = zh.split("\n");
  const out = [];
  try {
    for (const line of lines) {
      if (!line.trim()) { out.push(""); continue; }
      out.push(await tr(line));
    }
    const candidate = out.join("\n");
    if (countNl(candidate) === countNl(zh)) {
      cache[zh] = candidate;
      fixed++;
    } else failed++;
  } catch {
    failed++;
  }
}

fs.writeFileSync(CACHE, JSON.stringify(cache));
console.log(`repaired: ${fixed}  failed: ${failed}`);
for (const [zh, en] of bad.slice(0, 5)) {
  console.log("\nzh:", JSON.stringify(zh.slice(0, 80)));
  console.log("en:", JSON.stringify(cache[zh].slice(0, 120)));
}
