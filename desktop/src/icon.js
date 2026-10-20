/**
 * Rana's face as the tray and app icon.
 *
 * The character bundle draws it: a hidden BrowserWindow loads
 * renderer/icon.html, which renders Rana with the bundle, crops a square
 * around the head and hands back PNG data URLs. The 256 px result is cached
 * in userData under a name that carries the bundle's hash, so this runs once
 * per machine and bundle: a refreshed bundle gets a fresh render and the old
 * face is removed. Until the render is there (or when it fails) the small
 * inline PNG from icon-fallback.json is used.
 */
import { BrowserWindow, nativeImage } from "electron";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ICON_PAGE = join(__dirname, "..", "renderer", "icon.html");
export const BUNDLE_FILE = join(__dirname, "..", "renderer", "vendor", "exzi-character.js");
/** Every cache file this module ever wrote: rana-icon-256.png (older builds) and rana-icon-256-<hash>.png. */
export const ICON_CACHE_PATTERN = /^rana-icon-256(-[0-9a-f]+)?\.png$/;

/** The cache file name for the current bundle: its sha256 (12 hex) is in the name. */
export function iconCacheName(bundle = BUNDLE_FILE) {
  let tag = "nobundle";
  try { tag = createHash("sha256").update(readFileSync(bundle)).digest("hex").slice(0, 12); } catch { /* no bundle: one shared name */ }
  return `rana-icon-256-${tag}.png`;
}

/** Remove the cached faces of other bundles (and the unversioned one from older builds). */
export function forgetOldIcons(userData, keep, log = () => {}) {
  let names = [];
  try { names = readdirSync(userData); } catch { return 0; }
  let n = 0;
  for (const name of names) {
    if (name === keep || !ICON_CACHE_PATTERN.test(name)) continue;
    try { rmSync(join(userData, name), { force: true }); n++; } catch (e) { log("could not remove an old icon cache:", name, e && e.message); }
  }
  return n;
}

/** The inline fallback (32 px) as a nativeImage; an empty image if even that is missing. */
export function fallbackIcon() {
  try {
    const { png32 } = JSON.parse(readFileSync(join(__dirname, "icon-fallback.json"), "utf8"));
    return nativeImage.createFromBuffer(Buffer.from(png32, "base64"));
  } catch {
    return nativeImage.createEmpty();
  }
}

/** Render the icon with the bundle in a hidden window; resolves a nativeImage or throws. */
export async function renderIcon({ size = 256, timeoutMs = 8000, page = ICON_PAGE } = {}) {
  const w = new BrowserWindow({
    show: false,
    width: 400,
    height: 400,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  try {
    const result = await Promise.race([
      (async () => {
        await w.loadFile(page);
        const out = await w.webContents.executeJavaScript(`renderRanaIcon([${Number(size)}])`, true);
        const url = out && out[String(size)];
        if (!url || !url.startsWith("data:image/png")) throw new Error("renderer returned no PNG");
        return nativeImage.createFromDataURL(url);
      })(),
      new Promise((_r, reject) => setTimeout(() => reject(new Error(`icon render timed out after ${timeoutMs} ms`)), timeoutMs)),
    ]);
    if (result.isEmpty()) throw new Error("rendered icon is empty");
    return result;
  } finally {
    if (!w.isDestroyed()) w.destroy();
  }
}

/**
 * The best icon available now, and the rendered one when it is ready.
 * `onUpdate(image, source)` is called once more when a fresh render lands.
 */
export async function ensureIcon({ userData, onUpdate = () => {}, log = () => {}, render = renderIcon, cacheName = iconCacheName() } = {}) {
  const cached = join(userData, cacheName);
  if (existsSync(cached)) {
    const img = nativeImage.createFromPath(cached);
    if (!img.isEmpty()) return { image: img, source: "cache", done: Promise.resolve("cache") };
  }
  const fallback = fallbackIcon();
  // Render in the background; the tray starts with the fallback. `done` says how it ended.
  const done = (async () => {
    try {
      const img = await render({ size: 256 });
      mkdirSync(userData, { recursive: true });
      writeFileSync(cached, img.toPNG());
      const gone = forgetOldIcons(userData, cacheName, log);
      onUpdate(img, "rendered");
      return `rendered with the bundle (${img.getSize().width} px, cached at ${cached}${gone ? `, ${gone} old cache file${gone > 1 ? "s" : ""} removed` : ""})`;
    } catch (e) {
      log("icon render failed, keeping the fallback:", e && e.message);
      return `fallback (${e && e.message})`;
    }
  })();
  return { image: fallback, source: "fallback", done };
}

/** A tray-sized copy (Windows and Linux want 16–32 px; macOS takes a template-sized one). */
export function traySize(image) {
  if (image.isEmpty()) return image;
  const px = process.platform === "darwin" ? 22 : 32;
  const { width } = image.getSize();
  return width > px ? image.resize({ width: px, height: px, quality: "best" }) : image;
}
