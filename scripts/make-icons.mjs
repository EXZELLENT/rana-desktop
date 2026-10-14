#!/usr/bin/env node
/**
 * Renders Rana's face with the character bundle in headless Chrome and writes
 *   extension/icons/icon-{16,32,48,128}.png   (Chrome extension icons)
 *   desktop/build/icon.png                    (512 px; electron-builder makes .ico/.icns from it)
 *   desktop/src/icon-fallback.json            (the 32 px PNG as base64: the tray's inline fallback)
 *
 * The page is desktop/renderer/icon.html, the same one the app renders at runtime
 * (desktop/src/icon.js); here Chrome's --dump-dom returns the PNG data URLs it prints.
 * No npm dependency, one throw-away --user-data-dir under the OS temp folder, deleted
 * afterwards. Without Chrome, a grey disc with a gold ring stands in.
 *
 * Usage: node scripts/make-icons.mjs [--chrome <path>]
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const page = join(root, "desktop", "renderer", "icon.html");
const SIZES = [16, 32, 48, 128, 256, 512];

function findChrome() {
  const i = process.argv.indexOf("--chrome");
  if (i > -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = process.platform === "win32"
    ? [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      ]
    : process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((c) => c && existsSync(c)) || null;
}

/** Load the icon page in headless Chrome and return { size: dataUrl } from what it printed. */
function renderWithChrome(chrome, sizes) {
  const profile = mkdtempSync(join(tmpdir(), "rana-icons-"));
  try {
    const url = `${pathToFileURL(page).href}?sizes=${sizes.join(",")}`;
    const args = [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
      `--user-data-dir=${profile}`, "--allow-file-access-from-files", "--window-size=600,600",
      "--virtual-time-budget=8000", "--dump-dom", url,
    ];
    const r = spawnSync(chrome, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 90_000 });
    const out = String(r.stdout || "");
    const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const pre = /<pre id="out">([\s\S]*?)<\/pre>/.exec(out);
    const text = pre ? unescape(pre[1]).trim() : "";
    if (text.startsWith("RANA-ERROR")) throw new Error(`page reported: ${text.slice("RANA-ERROR ".length, 300)}`);
    if (!text.startsWith("RANA-ICONS ")) throw new Error(`no icons in the dumped DOM (chrome exit ${r.status}; #out: ${JSON.stringify(text.slice(0, 120))}; ${String(r.stderr).slice(0, 300)})`);
    return JSON.parse(text.slice("RANA-ICONS ".length));
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

/* ── the no-Chrome fallback: a grey disc with a gold ring, as a minimal PNG ── */
let crcTable;
function crc32(buf) {
  if (!crcTable) { crcTable = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; } }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function fallbackPng(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2, r = size * 0.47;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > r) continue;
    const o = (y * size + x) * 4;
    const ring = d > r * 0.82;
    // gold #F0C442 ring, grey (blue-grey/mist mix) disc
    px[o] = ring ? 0xf0 : 0xb9; px[o + 1] = ring ? 0xc4 : 0xbf; px[o + 2] = ring ? 0x42 : 0xd3; px[o + 3] = 255;
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/* ── run ── */
const chrome = findChrome();
let pngs = {};
let how = "fallback discs";
if (chrome) {
  try {
    const urls = renderWithChrome(chrome, SIZES);
    for (const s of SIZES) {
      const u = urls[String(s)];
      if (!u || !u.startsWith("data:image/png;base64,")) throw new Error(`no PNG for ${s} px`);
      pngs[s] = Buffer.from(u.slice("data:image/png;base64,".length), "base64");
    }
    how = `the character bundle in ${chrome}`;
  } catch (e) {
    console.warn(`[icons] chrome render failed (${e.message}); using fallback discs`);
    pngs = {};
  }
}
for (const s of SIZES) if (!pngs[s]) pngs[s] = fallbackPng(s);

mkdirSync(join(root, "extension", "icons"), { recursive: true });
mkdirSync(join(root, "desktop", "build"), { recursive: true });
for (const s of [16, 32, 48, 128]) writeFileSync(join(root, "extension", "icons", `icon-${s}.png`), pngs[s]);
writeFileSync(join(root, "desktop", "build", "icon.png"), pngs[512]);
writeFileSync(join(root, "desktop", "src", "icon-fallback.json"), JSON.stringify({ png32: pngs[32].toString("base64") }) + "\n");
console.log(`[icons] drawn with ${how}`);
for (const s of SIZES) console.log(`[icons] ${s} px: ${pngs[s].length} bytes`);
