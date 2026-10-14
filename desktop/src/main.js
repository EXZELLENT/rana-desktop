/**
 * Rana desktop — main process.
 * A frameless, transparent, always-on-top companion that senses (with consent):
 *   · active window app + title  (active-win)
 *   · system idle time           (Electron powerMonitor)
 * Signals → SignalEngine → reverse prompts → renderer bubble/moods, and, once
 * signed in with Exzellent, tips from the dashboard (guidance.js) through the
 * same bubble. Everything local except the signed-in calls listed in README.
 * Pause any time from the tray or by clicking Rana's 💤.
 *
 *   electron .          the app
 *   electron . --smoke  opens the window, waits for the renderer's "rana:ready",
 *                       prints "rana: smoke ok" and exits 0 (1 on any error)
 */
import { app, BrowserWindow, Tray, Menu, ipcMain, screen, powerMonitor, nativeImage, shell, safeStorage } from "electron";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { SignalEngine } from "./engine.js";
import { buildMessage } from "./messages.js";
import { Store } from "./store.js";
import { createAccount, sessionOnlyStore, PLAIN_SECRETS, DEFAULT_BASE_URL } from "./account.js";
import { createGuidance, TipGate } from "./guidance.js";
import { ensureIcon, traySize } from "./icon.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const R = (...p) => path.join(__dirname, "..", "renderer", ...p);

const PRODUCT = "Rana";
const APP_ID = "co.exzellent.rana";
const DASHBOARD_URL = "https://www.exzellent.co/student-dashboard";
const SMOKE = process.argv.includes("--smoke");
const SMOKE_TIMEOUT_MS = 8000;
const log = (...a) => console.log("rana:", ...a);

app.setAppUserModelId(APP_ID);
app.setName(PRODUCT); // userData lives under "Rana" in dev runs too, as in the packaged app

let win = null, settingsWin = null, tray = null, poller = null;
let store, engine, account, guidance, gate;
let tokensEncrypted = true; // false when safeStorage cannot encrypt here: the sign-in then lives in memory only
let appIcon = nativeImage.createEmpty();
let iconDone = Promise.resolve("none"); // settles when the bundle-rendered icon is in (or gave up)
let activeWindowFn = null; // lazy ESM import of active-win

/* ── settings the renderer may see (never the tokens) ── */
function publicSettings() {
  const { account: _a, ...rest } = store.data;
  return { ...rest, tips: store.get("tips") !== false, autostart: !!store.get("autostart"), apiBase: store.get("apiBase") || DEFAULT_BASE_URL, tokensEncrypted, account: account ? account.status() : null };
}
const send = (channel, payload) => {
  for (const w of [win, settingsWin]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
};
const tipsEnabled = () => store.get("tips") !== false && !store.get("paused");

/* ── sensing (unchanged from the prototype: local, consent-first) ── */
async function senseOnce() {
  if (!store.get("consented") || store.get("paused")) return;
  const consents = store.get("consents");
  let sample = { app: "", title: "", idleSec: 0 };
  try {
    if (consents.idle) sample.idleSec = powerMonitor.getSystemIdleTime();
    if (consents.activeWindow) {
      activeWindowFn ??= (await import("active-win")).activeWindow ?? (await import("active-win")).default;
      const aw = await activeWindowFn().catch(() => null);
      if (aw) { sample.app = aw.owner?.name ?? ""; sample.title = aw.title ?? ""; }
    }
  } catch { /* permission missing (macOS) or transient — stay quiet */ }

  const { state, events } = engine.ingest(sample, Date.now());
  win?.webContents.send("rana:state", state);
  for (const ev of events) {
    const msg = buildMessage(ev, store.get("profile"));
    win?.webContents.send("rana:prompt", { ...ev, ...msg });
  }
}

/* ── windows ── */
function createBuddyWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const pos = store.get("position") ?? { x: width - 300, y: height - 380 };
  win = new BrowserWindow({
    width: 280, height: 360, x: pos.x, y: pos.y,
    transparent: true, frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, title: PRODUCT, icon: appIcon.isEmpty() ? undefined : appIcon,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.loadFile(R("buddy.html"));
  win.setIgnoreMouseEvents(true, { forward: true }); // click-through until hovering Rana
  let moveSave = null;
  win.on("moved", () => {
    clearTimeout(moveSave);
    moveSave = setTimeout(() => { if (win && !win.isDestroyed()) { const [x, y] = win.getPosition(); store.set({ position: { x, y } }); } }, 400);
  });
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: "deny" }; });
}

function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 500, height: 760, title: `${PRODUCT} — settings`, autoHideMenuBar: true, icon: appIcon.isEmpty() ? undefined : appIcon,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  settingsWin.loadFile(R("settings.html"));
  settingsWin.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: "deny" }; });
  settingsWin.on("closed", () => (settingsWin = null));
}

/** Only Exzellent's own pages and the configured backend may be opened from Rana. */
function openExternal(url) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  const base = (() => { try { return new URL(account ? account.baseUrl : DEFAULT_BASE_URL).host; } catch { return ""; } })();
  const ok = u.protocol === "https:" && (/(^|\.)exzellent\.co$/.test(u.hostname) || (base && u.host === base));
  if (!ok) { log("refused to open", url); return false; }
  shell.openExternal(u.href);
  return true;
}

/* ── tray ── */
function buildTray() {
  tray = new Tray(traySize(appIcon));
  const refresh = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: store.get("paused") ? `▶ Resume ${PRODUCT}` : `⏸ Pause ${PRODUCT} (look away)`, click: togglePause },
    { label: "Open my dashboard", click: () => openExternal(DASHBOARD_URL) },
    { label: "⚙ Settings, consent & account", click: openSettings },
    { type: "separator" },
    { label: (() => { const s = account ? account.status() : null; return s && s.connected ? `Connected as ${s.user?.firstName || s.user?.name || "you"}` : "Not connected to Exzellent"; })(), enabled: false },
    { type: "separator" },
    { label: `Quit ${PRODUCT}`, click: () => app.quit() },
  ]));
  refresh();
  tray.setToolTip(`${PRODUCT} — your Exzellent companion`);
  tray.on("click", () => { if (win) { win.show(); win.setAlwaysOnTop(true, "screen-saver"); } });
  return refresh;
}
let refreshTray = () => {};

function togglePause() {
  store.set({ paused: !store.get("paused") });
  win?.webContents.send("rana:paused", store.get("paused"));
  refreshTray();
  if (!store.get("paused")) guidance?.poke();
}

/* ── autostart ── */
function applyAutostart() {
  const on = !!store.get("autostart");
  if (!app.isPackaged) { log(`autostart ${on ? "on" : "off"} (not applied: unpackaged dev run)`); return; }
  try {
    app.setLoginItemSettings({ openAtLogin: on, openAsHidden: true, path: process.execPath, args: [] });
  } catch (e) { log("autostart failed:", e.message); }
}

/* ── smoke mode ── */
function startSmoke() {
  let done = false;
  const finish = (ok, why) => {
    if (done) return;
    done = true;
    console.log(ok ? `rana: smoke ok (${why})` : `rana: smoke failed: ${why}`);
    app.exit(ok ? 0 : 1);
  };
  const timer = setTimeout(() => finish(false, `no rana:ready within ${SMOKE_TIMEOUT_MS} ms`), SMOKE_TIMEOUT_MS);
  ipcMain.once("rana:ready", async () => {
    clearTimeout(timer);
    // Give the hidden icon window a moment too, so the smoke run also covers the bundle's render path.
    const icon = await Promise.race([iconDone, new Promise((r) => setTimeout(() => r("still rendering"), 4000))]);
    finish(true, `renderer mounted the character and sent rana:ready; icon: ${icon}`);
  });
  ipcMain.on("rana:error", (_e, m) => finish(false, `renderer error: ${m}`));
  win.webContents.on("did-fail-load", (_e, code, desc) => finish(false, `did-fail-load ${code} ${desc}`));
  win.webContents.on("render-process-gone", (_e, d) => finish(false, `renderer gone: ${d.reason}`));
  process.on("uncaughtException", (e) => finish(false, e.stack || e.message));
  process.on("unhandledRejection", (e) => finish(false, `unhandled rejection: ${e && e.stack || e}`));
}

/* ── boot ── */
app.whenReady().then(async () => {
  store = new Store(path.join(app.getPath("userData"), "rana-settings.json"));
  engine = new SignalEngine({ quietFrom: store.get("quiet").from, quietTo: store.get("quiet").to });

  // Tokens: encrypted with the OS keychain/DPAPI when Electron can. When it cannot, nothing plain is written
  // to disk: the account lives in memory for this run only (sessionOnlyStore) and the settings page says so.
  tokensEncrypted = (() => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } })();
  if (!tokensEncrypted) log("safeStorage unavailable: the sign-in is kept in memory and lasts until Rana quits (nothing is written plain)");
  const secrets = tokensEncrypted
    ? { encrypt: (s) => "enc:" + safeStorage.encryptString(s).toString("base64"), decrypt: (s) => safeStorage.decryptString(Buffer.from(String(s).replace(/^enc:/, ""), "base64")) }
    : PLAIN_SECRETS;
  account = createAccount({
    store: tokensEncrypted ? store : sessionOnlyStore(store), secrets, client: "rana-desktop", deviceName: os.hostname(),
    baseUrl: process.env.RANA_API_BASE || null, log,
  });
  gate = new TipGate({ quietFrom: store.get("quiet").from, quietTo: store.get("quiet").to });
  guidance = createGuidance({
    account, gate, isEnabled: tipsEnabled, log,
    onTip: (tip) => win?.webContents.send("rana:tip", tip),
  });
  account.on((s) => {
    send("rana:account", s);
    refreshTray();
    if (s.reason === "approved") {
      const who = s.user?.firstName || s.user?.name || "you";
      win?.webContents.send("rana:prompt", { type: "connected", mood: "celebrate", text: `Connected as ${who} 🎉 I'll pass on what your dashboard wants you to know.` });
      guidance.poke();
    }
  });

  const { image, source, done } = await ensureIcon({
    userData: app.getPath("userData"), log,
    onUpdate: (img) => { appIcon = img; tray?.setImage(traySize(img)); win?.setIcon?.(img); if (process.platform === "darwin") app.dock?.setIcon(img); },
  });
  appIcon = image;
  iconDone = done;
  log(`icon: ${source}`);
  if (process.platform === "darwin" && !appIcon.isEmpty()) app.dock?.setIcon(appIcon);

  createBuddyWindow();
  if (SMOKE) startSmoke();
  refreshTray = buildTray();
  poller = setInterval(senseOnce, 3000);
  guidance.start();
  applyAutostart();
  if (!store.get("consented") && !SMOKE) setTimeout(openSettings, 900); // consent-first
});

app.on("window-all-closed", (e) => e.preventDefault?.()); // tray app keeps living
app.on("before-quit", () => { clearInterval(poller); guidance?.stop(); });

/* ── IPC ── */
ipcMain.on("rana:ready", () => log("renderer ready"));
ipcMain.on("rana:error", (_e, m) => log("renderer error:", m));
ipcMain.on("rana:set-ignore", (_e, flag) => win?.setIgnoreMouseEvents(!!flag, { forward: true }));
ipcMain.on("rana:open-settings", openSettings);
ipcMain.on("rana:toggle-pause", togglePause);
ipcMain.on("rana:hide", () => win?.hide());
ipcMain.on("rana:quit", () => app.quit());
ipcMain.handle("rana:get-settings", () => publicSettings());
ipcMain.on("rana:save-settings", (_e, patch) => {
  if (!patch || typeof patch !== "object") return;
  const { account: _a, position: _p, ...safe } = patch; // the account and the window position are not the settings page's to set
  if (typeof safe.apiBase === "string") safe.apiBase = safe.apiBase.trim().replace(/\/+$/, "") || DEFAULT_BASE_URL;
  store.set(safe);
  if (safe.quiet) {
    engine = new SignalEngine({ quietFrom: safe.quiet.from, quietTo: safe.quiet.to });
    gate.setQuiet(safe.quiet.from, safe.quiet.to);
  }
  if ("paused" in safe) win?.webContents.send("rana:paused", store.get("paused"));
  send("rana:settings", publicSettings());
  refreshTray();
  if ("tips" in safe && safe.tips) guidance?.poke();
});
ipcMain.handle("rana:drag-start", () => (win ? win.getPosition() : [0, 0]));
ipcMain.on("rana:drag-move", (_e, { x, y } = {}) => {
  if (!win || !Number.isFinite(x) || !Number.isFinite(y)) return;
  win.setPosition(Math.round(x), Math.round(y));
});
ipcMain.on("rana:tip-feedback", (_e, { tipId, verdict } = {}) => { guidance?.feedback(tipId, verdict); });
ipcMain.on("rana:open-external", (_e, url) => openExternal(url));
ipcMain.on("rana:open-dashboard", () => openExternal(DASHBOARD_URL));
ipcMain.on("rana:set-autostart", (_e, flag) => { store.set({ autostart: !!flag }); applyAutostart(); send("rana:settings", publicSettings()); });
ipcMain.handle("rana:account-status", () => account.status());
ipcMain.handle("rana:account-start", async () => {
  try { return { ok: true, ...(await account.start()) }; }
  catch (e) { log("sign-in start failed:", e.message); return { ok: false, error: e.message || "could not reach Exzellent" }; }
});
ipcMain.on("rana:account-cancel", () => account.cancel());
ipcMain.handle("rana:account-disconnect", async () => { await account.disconnect(); return account.status(); });
