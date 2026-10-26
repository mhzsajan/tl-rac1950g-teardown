import fs from "node:fs";
const file = process.argv[2] || "work/bundle/business.bundle.patched";
const t = fs.readFileSync(file, "utf8");
const d = t.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const kws = ["Firmware", "firmware", "Upgrade", "upgrade", "Software", "Check for updates",
  "Restore", "Reboot", "Reboot router", "Administrator password", "Admin password",
  "Local management", "Wireless settings", "Internet settings", "Device management",
  "Factory reset", "Access control", "Guest network", "Network topology"];
for (const kw of kws) {
  const n = d.split(kw).length - 1;
  if (n) console.log(kw.padEnd(26), n);
}

console.log("\n--- firmware/upgrade/update literals ---");
const seen = new Set();
for (const m of d.matchAll(/["'`]([^"'`\n]{0,100}(?:irmware|pgrade|pdate)[^"'`\n]{0,100})["'`]/g)) {
  const s = m[1].trim();
  if (s.length < 4 || seen.has(s)) continue;
  seen.add(s);
  if (seen.size <= 18) console.log("  ", JSON.stringify(s));
}
console.log("total distinct:", seen.size);
