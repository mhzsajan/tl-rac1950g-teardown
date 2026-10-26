import fs from "node:fs";
import path from "node:path";

const CJK = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const CJKG = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;
const ESC = /\\u([0-9a-fA-F]{4})/g;
const dec = (s) => s.replace(ESC, (_, h) => String.fromCharCode(parseInt(h, 16)));

function literals(text) {
  const out = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(text))) {
    const body = m[1] ?? m[2] ?? m[3];
    if (body) out.push(body);
  }
  return out;
}

for (const f of process.argv.slice(2)) {
  const text = fs.readFileSync(f, "utf8");
  const d = dec(text);
  const raw = (text.match(CJKG) || []).length;
  const cjk = (d.match(CJKG) || []).length;

  const lits = literals(text);
  const cjkLits = new Map();
  for (const l of lits) {
    const dl = dec(l);
    if (!CJK.test(dl)) continue;
    if (/[{};]|function\s|=>|var\s|prototype|require\(/.test(dl)) continue;
    cjkLits.set(dl, (cjkLits.get(dl) || 0) + 1);
  }

  // mangled hybrids: Chinese immediately adjacent to ASCII letters
  const hybrids = new Set();
  for (const m of d.matchAll(/[\u4e00-\u9fff]{1,8}[A-Za-z]{2,}|[A-Za-z]{2,}[\u4e00-\u9fff]{1,8}/g)) {
    if (m[0].length < 40) hybrids.add(m[0]);
  }

  const probes = ["All equipment", "Equipment", "connected terminals", "routers networked",
    "Device Management", "网络拓扑", "本机", "主人网络", "路由设置", "上网设置", "无线设置",
    "设备管理", "网络状态", "管理员密码", "恢复出厂"];
  const probeHits = {};
  for (const p of probes) {
    const n = (d.split(p).length - 1);
    if (n) probeHits[p] = n;
  }

  console.log(JSON.stringify({
    file: path.basename(f),
    bytes: fs.statSync(f).size,
    rawCjk: raw,
    cjkCharsDecoded: cjk,
    cjkLiterals: cjkLits.size,
    hybridCount: hybrids.size,
    hybridSamples: [...hybrids].slice(0, 20),
    probeHits,
    topCjkLiterals: [...cjkLits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
  }, null, 1));
}
