#!/usr/bin/env node
/** ctx.mjs — show decoded JS context around a phrase inside a Metro bundle. */
import fs from "node:fs";

const [file, phrase, before = "600", after = "600"] = process.argv.slice(2);
const raw = fs.readFileSync(file, "utf8");
const decoded = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const i = decoded.indexOf(phrase);
if (i < 0) {
  console.log("NOT FOUND in decoded text");
  process.exit(1);
}
const b = Number(before), a = Number(after);
console.log("=== context (decoded) ===");
console.log(decoded.slice(Math.max(0, i - b), i + phrase.length + a));
console.log("\n=== occurrences:", decoded.split(phrase).length - 1, "===");
