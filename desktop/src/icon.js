/**
 * Rana's face as the tray and app icon.
 *
 * The character bundle draws it: a hidden BrowserWindow loads
 * renderer/icon.html, which renders Rana with the bundle, crops a square
 * around the head and hands back PNG data URLs. The 256 px result is cached
 * in userData, so this runs once per machine; until it is there (or when it
 * fails) the small inline PNG from icon-fallback.json is used.
 */
import { BrowserWindow, nativeImage } from "electron";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ICON_PAGE = join(__dirname, "..", "renderer", "icon.html");
export const ICON_FILE = "rana-icon-256.png";

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
export async function ensureIcon({ userData, onUpdate = () => {}, log = () => {}, render = renderIcon } = {}) {
  const cached = join(userData, ICON_FILE);
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
      onUpdate(img, "rendered");
      return `rendered with the bundle (${img.getSize().width} px, cached at ${cached})`;
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
