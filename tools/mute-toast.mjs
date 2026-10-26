#!/usr/bin/env node
/**
 * mute-toast.mjs — stop one specific toast from being shown.
 *
 * The app raises a toast for router API error code 40101 ("device system
 * error") whenever some optional data request fails — e.g. on the device and
 * More settings pages, where it is noise rather than a real failure.
 *
 * Every toast in the app funnels through one call:
 *     NativeModules.TRNDialogAndroid.showToast(t, o, u, f)
 * so we guard that call with a message comparison. Surgical: one expression,
 * no other logic touched.
 */
import fs from "node:fs";

const [, , inFile, outFile] = process.argv;
const MUTED = ["Some router data is unavailable."];
let src = fs.readFileSync(inFile, "utf8");

const call = "s.NativeModules.TRNDialogAndroid.showToast(t,o,u,f)";
const guard =
  "(" +
  MUTED.map((m) => `t===${JSON.stringify(m)}`).join("||") +
  "?0:" +
  call +
  ")";

const n = src.split(call).length - 1;
if (n !== 1) {
  console.error(`expected exactly 1 toast call site, found ${n}. refusing to patch.`);
  process.exit(1);
}
src = src.split(call).join(guard);
fs.writeFileSync(outFile, src, "utf8");
console.log(`patched toast call: ${n} site, muted ${MUTED.length} message(s)`);
console.log(`size ${src.length}`);
