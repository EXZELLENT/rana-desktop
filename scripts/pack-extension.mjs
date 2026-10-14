#!/usr/bin/env node
/**
 * Zips extension/ into dist/rana-extension-<version>.zip (the version from
 * manifest.json), ready for "Load unpacked" after unzipping or for the Web Store.
 * No dependency: a small zip writer here, deflate from node:zlib.
 *
 * Usage: node scripts/pack-extension.mjs   (npm run pack)
 */
import { readdirSync, statSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "extension");
const manifest = JSON.parse(readFileSync(join(src, "manifest.json"), "utf8"));
const outDir = join(root, "dist");
const out = join(outDir, `rana-extension-${manifest.version}.zip`);

function walk(dir, base = dir, list = []) {
  for (const name of readdirSync(dir).sort()) {
    if (name === ".DS_Store" || name === "Thumbs.db") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, base, list);
    else list.push({ name: relative(base, p).split(sep).join("/"), file: p, mtime: st.mtime });
  }
  return list;
}

let crcTable;
function crc32(buf) {
  if (!crcTable) { crcTable = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; } }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xffff;
const dosDate = (d) => (((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const data = readFileSync(e.file);
    const deflated = deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const method = stored ? 0 : 8;
    const name = Buffer.from(e.name, "utf8");
    const crc = crc32(data);
    const t = dosTime(e.mtime), d = dosDate(e.mtime);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(method, 8);
    local.writeUInt16LE(t, 10); local.writeUInt16LE(d, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(method, 10);
    central.writeUInt16LE(t, 12); central.writeUInt16LE(d, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);

    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, eocd]);
}

const entries = walk(src);
if (!entries.some((e) => e.name === "manifest.json")) throw new Error("extension/manifest.json missing");
mkdirSync(outDir, { recursive: true });
const bytes = zip(entries);
writeFileSync(out, bytes);
console.log(`[pack] ${relative(root, out)}: ${entries.length} files, ${bytes.length} bytes`);
for (const e of entries) console.log(`[pack]   ${e.name}`);
