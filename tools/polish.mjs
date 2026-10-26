#!/usr/bin/env node
/**
 * polish.mjs — fix wording in the patched Metro bundles, STRING LITERALS ONLY.
 *
 * Replacing raw text across a 5 MB bundle is dangerous: words like "terminal"
 * also appear in identifiers (`terminalType`, `pushTerminal`). This walks the
 * bundle with a string/template/comment-aware scanner and rewrites only the
 * CONTENTS of quoted literals, so code cannot be touched.
 *
 * Usage: node polish.mjs <bundle-in> <bundle-out>
 */
import fs from "node:fs";

const [, , inFile, outFile] = process.argv;
const src = fs.readFileSync(inFile, "utf8");

// phrase -> replacement (case-sensitive, applied inside literals only)
const MAP = [
  ["All equipment", "All devices"],
  ["Equipment management", "Device management"],
  ["connected terminals", "connected devices"],
  ["connected terminal", "connected device"],
  ["Device system error!", "Some router data is unavailable."],
  ["forget the password", "Forgot password"],
  ["wireless timing", "Wireless schedule"],
  ["network management", "Network management"],
  ["routers mesh", "routers in mesh"],
  ["Equipment", "Devices"],
];

function applyToText(text) {
  let t = text;
  for (const [a, b] of MAP) t = t.split(a).join(b);
  t = t.replace(/main route(?!r)/g, "main router");
  return t;
}

// Scanner: copy code verbatim; for literals, rewrite contents only.
let out = "";
let i = 0;
let changed = 0;
let literals = 0;
const n = src.length;

while (i < n) {
  const c = src[i];
  if (c === '"' || c === "'" || c === "`") {
    const quote = c;
    let j = i + 1;
    let body = "";
    while (j < n) {
      if (src[j] === "\\") { body += src[j] + src[j + 1]; j += 2; continue; }
      if (src[j] === quote) break;
      body += src[j];
      j++;
    }
    if (j >= n) { out += src.slice(i); break; }
    literals++;
    const nb = applyToText(body);
    if (nb !== body) changed++;
    out += quote + nb + quote;
    i = j + 1;
    continue;
  }
  if (c === "/" && src[i + 1] === "/") { // line comment
    const j = src.indexOf("\n", i);
    if (j === -1) { out += src.slice(i); break; }
    out += src.slice(i, j);
    i = j;
    continue;
  }
  if (c === "/" && src[i + 1] === "*") { // block comment
    const j = src.indexOf("*/", i + 2);
    if (j === -1) { out += src.slice(i); break; }
    out += src.slice(i, j + 2);
    i = j + 2;
    continue;
  }
  // regex literals are rare in these bundles; treating them as code is safest
  out += c;
  i++;
}

fs.writeFileSync(outFile, out, "utf8");
console.log(`literals scanned: ${literals}, literals changed: ${changed}`);
console.log(`size ${n} -> ${out.length} (${out.length - n >= 0 ? "+" : ""}${out.length - n})`);
