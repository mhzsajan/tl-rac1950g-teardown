#!/usr/bin/env node
/**
 * build-cache.mjs — translate every Chinese UI string in the app to English.
 *
 * Sources, all pristine, from the ORIGINAL debug-signed APK (not the prior
 * mangled patch):
 *   1. res/values/{strings,plurals,arrays}.xml   -> native Android UI
 *   2. assets/plugins/*.bin -> business.bundle   -> React Native router UI
 *   3. assets/rn_sdk/sdk.bundle                  -> React Native app shell
 *
 * Output: cache.json  { "<chinese source>": "<english>" }
 * Plus:   cache-report.json (coverage + placeholder mismatches)
 *
 * Uses clients5.google.com (plain-array response, ~11 req/s, no throttling).
 * Falls back to translate.googleapis.com on failure.
 */
import fs from "node:fs";

const ROOT = "C:/Users/o0o/Documents/deepseek-harness/default-workspace/tl-en";
const TREE = ROOT + "/orig-res";
const OUT = ROOT + "/cache.json";

const CJK = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const CJKG = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;
const decodeEsc = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const unxml = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, "&")
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

// ---------------------------------------------------------------- collect
const wanted = new Map(); // chinese -> Set(origin)
function add(text, origin) {
  const t = text.trim();
  if (!t || !CJK.test(t)) return;
  if (t.length > 400) return;
  if (!wanted.has(t)) wanted.set(t, new Set());
  wanted.get(t).add(origin);
}

for (const f of ["strings.xml", "plurals.xml", "arrays.xml"]) {
  const p = `${TREE}/res/values/${f}`;
  if (!fs.existsSync(p)) continue;
  const xml = fs.readFileSync(p, "utf8");
  for (const m of xml.matchAll(/<(string|item)\b([^>]*)>([\s\S]*?)<\/\1>/g)) add(unxml(m[3]), f);
  for (const m of xml.matchAll(/<string-array\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/string-array>/g)) {
    for (const it of m[2].matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) add(unxml(it[1]), `${f}:${m[1]}`);
  }
}

function bundleLiterals(file, origin) {
  const text = fs.readFileSync(file, "utf8");
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[1] ?? m[2] ?? m[3];
    if (!raw) continue;
    const d = decodeEsc(raw);
    if (!CJK.test(d)) continue;
    if (/[{};]|function\s|=>|var\s|prototype|require\(|\.default|\breturn\b/.test(d)) continue;
    add(d, origin);
    if (d.length > 400) for (const part of d.split(/[\n。！？!?]/)) add(part, origin);
  }
}
bundleLiterals(ROOT + "/bundle-vendor.js", "business.bundle");
bundleLiterals(TREE + "/assets/rn_sdk/sdk.bundle", "sdk.bundle");

// ---------------------------------------------------------------- curated
// Short, context-free UI fragments that MT reliably gets wrong.
const CURATED = {
  "确定": "OK", "取消": "Cancel", "保存": "Save", "删除": "Delete", "编辑": "Edit",
  "完成": "Done", "返回": "Back", "下一步": "Next", "上一步": "Previous", "跳过": "Skip",
  "关闭": "Close", "开启": "On", "启用": "Enable", "禁用": "Disable", "重置": "Reset",
  "刷新": "Refresh", "加载中": "Loading…", "加载中…": "Loading…", "正在加载…": "Loading…",
  "请稍候": "Please wait", "请稍候…": "Please wait…", "成功": "Success", "失败": "Failed",
  "已保存": "Saved", "已删除": "Deleted", "已开启": "On", "已关闭": "Off",
  "是": "Yes", "否": "No", "更多": "More", "设置": "Settings", "高级设置": "Advanced settings",
  "设备": "Device", "设备管理": "Device management", "网络": "Network", "网络状态": "Network status",
  "无线": "Wireless", "无线设置": "Wireless settings", "访客网络": "Guest network",
  "主人网络": "Main network", "上网设置": "Internet settings", "路由设置": "Router settings",
  "网络拓扑": "Network topology", "本机": "This device", "连接设备": "Connected devices",
  "已连设备": "Connected devices", "重启路由器": "Restart router", "恢复出厂": "Factory reset",
  "管理员密码": "Admin password", "软件升级": "Firmware upgrade", "桥模式": "Bridge mode",
  "IP与MAC绑定": "IP & MAC binding", "上网时间": "Access time",
  "无线设备接入控制": "Wireless device access control", "上网方式设置": "Internet connection type",
  "系统工具": "System tools", "时间设置": "Time settings", "动态DNS": "Dynamic DNS",
  "端口转发": "Port forwarding", "虚拟服务器": "Virtual server", "安全": "Security",
  "名称": "Name", "密码": "Password", "用户名": "Username", "确认密码": "Confirm password",
  "输入密码": "Enter password", "请输入": "Please enter", "未知": "Unknown",
  "暂无": "None", "全部": "All", "自动": "Auto", "手动": "Manual", "立即": "Now",
  "添加": "Add", "移除": "Remove", "修改": "Modify", "查看": "View", "详情": "Details",
  "帮助": "Help", "提示": "Note", "注意": "Note", "警告": "Warning", "错误": "Error",
  "重试": "Retry", "退出": "Exit", "登录": "Sign in", "注册": "Register", "账户": "Account",
  "操作失败": "Operation failed", "操作成功": "Operation successful", "保存成功": "Saved",
  "设置成功": "Settings saved", "已复制": "Copied", "复制": "Copy", "共享": "Share",
  "下载": "Download", "上传": "Upload", "搜索": "Search", "扫描": "Scan",
  "未填写": "Not filled in", "必填": "Required", "选填": "Optional",
  "已连接": "Connected", "未连接": "Not connected", "连接中": "Connecting…",
  "在线": "Online", "离线": "Offline", "启用中": "Enabled", "未启用": "Not enabled",
};

const cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
for (const [k, v] of Object.entries(CURATED)) cache[k] = v;

const todo = [...wanted.keys()].filter((k) => !(k in cache));
console.log(`unique Chinese strings : ${wanted.size}`);
console.log(`already in cache       : ${wanted.size - todo.length}`);
console.log(`to translate           : ${todo.length}`);

// ---------------------------------------------------------------- translate
const CONC = 6;
let done = 0, failed = 0, idx = 0;
const fails = [];
const UA = { "User-Agent": "Mozilla/5.0" };

async function gtxClients5(q) {
  const url = "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=zh-CN&tl=en&q=" + encodeURIComponent(q);
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  const out = Array.isArray(j) ? (typeof j[0] === "string" ? j[0] : (j[0] || []).join("")) : "";
  if (!out) throw new Error("bad shape");
  return out.trim();
}

async function gtxSingle(q) {
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=en&dt=t&q=" + encodeURIComponent(q);
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  let out = "";
  for (const seg of j[0] || []) if (seg && seg[0]) out += seg[0];
  if (!out) throw new Error("empty");
  return out.trim();
}

let lastSave = Date.now();
function save() {
  fs.writeFileSync(OUT, JSON.stringify(cache), "utf8");
  lastSave = Date.now();
}

async function worker() {
  for (;;) {
    const i = idx++;
    if (i >= todo.length) return;
    const zh = todo[i];
    let ok = false;
    for (let attempt = 0; attempt < 5 && !ok; attempt++) {
      try {
        cache[zh] = attempt < 3 ? await gtxClients5(zh) : await gtxSingle(zh);
        ok = true;
        done++;
      } catch (e) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    if (!ok) { failed++; fails.push(zh); }
    const n = done + failed;
    if (n % 500 === 0) console.log(`  ${n}/${todo.length} ok=${done} fail=${failed} ${(n / ((Date.now() - T0) / 1000)).toFixed(1)}/s`);
    if (Date.now() - lastSave > 10000) save();
  }
}

const T0 = Date.now();
await Promise.all(Array.from({ length: CONC }, worker));
save();

// ---------------------------------------------------------------- report
const missing = todo.filter((k) => !(k in cache));
const cjkLeft = Object.entries(cache).filter(([, v]) => CJK.test(v)).map(([k, v]) => [k, v]);
const ph = /%(?:\d+\$)?[-+ #0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[diouxXeEfFgGcs]/g;
const phMismatch = [];
for (const [zh, en] of Object.entries(cache)) {
  const a = (zh.match(ph) || []).sort().join(","), b = (en.match(ph) || []).sort().join(",");
  if (a !== b) phMismatch.push({ zh, en, zhPh: a, enPh: b });
}
const report = {
  uniqueStrings: wanted.size,
  translated: Object.keys(cache).length,
  failed: fails.length,
  stillCjk: cjkLeft.length,
  placeholderMismatches: phMismatch.length,
  cjkSamples: cjkLeft.slice(0, 20),
  phSamples: phMismatch.slice(0, 25),
  seconds: Math.round((Date.now() - T0) / 1000),
};
fs.writeFileSync(ROOT + "/cache-report.json", JSON.stringify(report, null, 1));
if (fails.length) fs.writeFileSync(ROOT + "/translate-failures.json", JSON.stringify(fails, null, 1));
fs.writeFileSync(ROOT + "/cache-final.flag", String(Date.now()));
console.log(JSON.stringify(report, null, 1));
