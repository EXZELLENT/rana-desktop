#!/usr/bin/env node
/**
 * Renders the Chrome Web Store images into docs/chrome-web-store/images/ with headless
 * Chrome over the DevTools protocol, from the small pages beside this script (they use
 * the vendored character bundle and the extension's own popup, options and content
 * script; no other artwork):
 *
 *   store-icon-128.png             128 x 128, transparent (96 x 96 artwork, 16 px padding)
 *   screenshot-1-dashboard.png     1280 x 800  Rana's overlay with a tip on the dashboard
 *   screenshot-2-popup-options.png 1280 x 800  the popup with a tip, the settings connected
 *   screenshot-3-connect.png       1280 x 800  connecting with a code
 *   promo-small-440x280.png        440 x 280   the small promo tile
 *
 * The screenshots and the tile are written as 24-bit PNGs (no alpha), as the store asks.
 * The repo root is served on 127.0.0.1 for the run (the pages load ../../../extension/…);
 * Chrome gets a throw-away --user-data-dir under the OS temp folder, deleted afterwards.
 *
 * Usage: node docs/chrome-web-store/source/make-images.mjs [--chrome <path>]
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..", "..");
const outDir = resolve(here, "..", "images");
const stub = readFileSync(join(here, "chrome-stub.js"), "utf8");
const page = (name) => `docs/chrome-web-store/source/${name}`;

const SHOTS = [
  { out: "store-icon-128.png", url: page("icon.html"), w: 128, h: 128, transparent: true },
  { out: "screenshot-1-dashboard.png", url: page("shot-dashboard.html"), w: 1280, h: 800, state: "connected" },
  { out: "screenshot-2-popup-options.png", url: page("shot-settings.html?state=connected"), w: 1280, h: 800, state: "connected" },
  { out: "screenshot-3-connect.png", url: page("shot-settings.html?state=pending"), w: 1280, h: 800, state: "pending" },
  { out: "promo-small-440x280.png", url: page("promo-small.html"), w: 440, h: 280 },
];

function findChrome() {
  const i = process.argv.indexOf("--chrome");
  if (i > -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = process.platform === "win32"
    ? ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe")]
    : process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((c) => c && existsSync(c)) || null;
}

/* ── a read-only static server for the repo root, on 127.0.0.1 ── */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = resolve(root, "." + path);
    if (!(file === root || file.startsWith(root + sep)) || !existsSync(file)) { res.writeHead(404).end(); return; }
    try { res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

/* ── a minimal DevTools-protocol client over the browser's WebSocket ── */
async function devtools(chrome, profile) {
  const proc = spawn(chrome, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((ok, fail) => {
    let err = "";
    const t = setTimeout(() => fail(new Error(`no DevTools URL from Chrome: ${err.slice(0, 300)}`)), 30_000);
    proc.stderr.on("data", (d) => {
      err += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
      if (m) { clearTimeout(t); ok(m[1]); }
    });
    proc.on("exit", (code) => { clearTimeout(t); fail(new Error(`chrome exited (${code}): ${err.slice(0, 300)}`)); });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error("DevTools socket failed")); });
  let id = 0;
  const waiting = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) {
      const { ok, fail } = waiting.get(msg.id); waiting.delete(msg.id);
      if (msg.error) fail(new Error(msg.error.message)); else ok(msg.result);
    } else for (const l of listeners) l(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const n = ++id;
    waiting.set(n, { ok, fail });
    ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const once = (method, sessionId, ms = 20_000) => new Promise((ok, fail) => {
    const t = setTimeout(() => { listeners.delete(l); fail(new Error(`timed out waiting for ${method}`)); }, ms);
    const l = (msg) => { if (msg.method === method && msg.sessionId === sessionId) { clearTimeout(t); listeners.delete(l); ok(msg.params); } };
    listeners.add(l);
  });
  const close = async () => {
    try { await send("Browser.close"); } catch { /* already gone */ }
    try { ws.close(); } catch { /* closed */ }
    await new Promise((ok) => { if (proc.exitCode !== null) ok(); else { proc.once("exit", ok); setTimeout(() => { try { proc.kill(); } catch { /* gone */ } ok(); }, 5000); } });
  };
  return { send, once, close };
}

/* ── RGBA PNG → 24-bit RGB PNG (the store refuses alpha in screenshots and tiles) ── */
let crcTable;
function crc32(buf) {
  if (!crcTable) { crcTable = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; } }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function toRgb(png) {
  let off = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off), t = png.toString("ascii", off + 4, off + 8), data = png.subarray(off + 8, off + 8 + len);
    if (t === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (t === "IDAT") idat.push(data);
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (type !== 6 && type !== 2)) throw new Error(`unexpected PNG (depth ${depth}, type ${type}, interlace ${interlace})`);
  if (type === 2) return { png, w, h, type };
  const bpp = 4, stride = w * bpp, raw = inflateSync(Buffer.concat(idat));
  const cur = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  const out = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 0xff;
    }
    const o = y * (w * 3 + 1);
    out[o] = 0;
    for (let x = 0; x < w; x++) {
      // composite over black should anything be translucent (an opaque page has alpha 255 throughout)
      const al = cur[x * 4 + 3] / 255;
      out[o + 1 + x * 3] = Math.round(cur[x * 4] * al);
      out[o + 2 + x * 3] = Math.round(cur[x * 4 + 1] * al);
      out[o + 3 + x * 3] = Math.round(cur[x * 4 + 2] * al);
    }
    cur.copy(prev);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return { png: Buffer.concat([png.subarray(0, 8), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(out, { level: 9 })), chunk("IEND", Buffer.alloc(0))]), w, h, type: 2 };
}

/* ── run ── */
const chromePath = findChrome();
if (!chromePath) { console.error("[store] Chrome not found (pass --chrome <path>)"); process.exit(1); }
mkdirSync(outDir, { recursive: true });
const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = mkdtempSync(join(tmpdir(), "rana-store-"));
let cdp;
let failed = false;
try {
  cdp = await devtools(chromePath, profile);
  for (const shot of SHOTS) {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => cdp.send(m, p, sessionId);
    await s("Page.enable");
    await s("Runtime.enable");
    await s("Emulation.setDeviceMetricsOverride", { width: shot.w, height: shot.h, deviceScaleFactor: 1, mobile: false });
    if (shot.transparent) await s("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    await s("Page.addScriptToEvaluateOnNewDocument", { source: `var RANA_SHOT = ${JSON.stringify(shot.state || "connected")};\n${stub}` });
    const loaded = cdp.once("Page.loadEventFired", sessionId);
    await s("Page.navigate", { url: `${origin}/${shot.url}` });
    await loaded;
    const deadline = Date.now() + 15_000;
    for (;;) {
      const r = await s("Runtime.evaluate", { expression: "window.__shotReady === true", returnByValue: true });
      if (r.result && r.result.value === true) break;
      if (Date.now() > deadline) throw new Error(`${shot.out}: the page never said it was ready`);
      await new Promise((ok) => setTimeout(ok, 150));
    }
    await new Promise((ok) => setTimeout(ok, 300));
    const { data } = await s("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: shot.w, height: shot.h, scale: 1 } });
    let png = Buffer.from(data, "base64");
    if (!shot.transparent) png = toRgb(png).png;
    writeFileSync(join(outDir, shot.out), png);
    console.log(`[store] ${shot.out}: ${shot.w} x ${shot.h}, ${png.length} bytes`);
    await cdp.send("Target.closeTarget", { targetId });
  }
} catch (e) {
  failed = true;
  console.error(`[store] ${e.message}`);
} finally {
  if (cdp) await cdp.close();
  server.close();
  // Chrome can hold its profile a moment after it exits: remove it, wait, retry.
  for (let i = 0; i < 15 && existsSync(profile); i++) {
    try { rmSync(profile, { recursive: true, force: true }); } catch { await new Promise((ok) => setTimeout(ok, 1000)); }
  }
  if (existsSync(profile)) console.warn(`[store] could not remove ${profile}`);
}
process.exit(failed ? 1 : 0);
