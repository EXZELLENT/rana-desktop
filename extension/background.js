/* Rana extension — the service worker.
 * Owns the account (device-code sign-in, tokens in chrome.storage.local, refresh on
 * 401, revoke on disconnect), polls the dashboard's guidance on alarms, keeps the one
 * waiting tip (badge "1"), sends feedback, and relays to the content script and the
 * popup. Pages never see a token. Contract: companion-api.md §3, §4, §6. */
importScripts("lib/common.js");

const S = chrome.storage.local;
const ALARM_GUIDANCE = "rana-guidance";
const ALARM_DEVICE = "rana-device-poll";
const EVERYWHERE_ID = "rana-everywhere";
const log = (...a) => console.log("rana:", ...a);

/* ── storage ──
 * account  { user, token, refreshToken, connectedAt } | null
 * pending  { deviceCode, userCode, verifyUrl, interval, expiresAt } | null
 * tip      the tip waiting in the bubble | null
 * gate     { lastShown: {kind: ts}, neverUntil: {kind: ts}, snoozedUntil }
 * poll     { failures, since, lastPolledAt, lastError }
 * settings { everywhere, tips, quiet, apiBase } */
async function get(key, fallback) { const r = await S.get(key); return r[key] === undefined ? fallback : r[key]; }
async function set(obj) { return S.set(obj); }
async function settings() { return { ...RANA.DEFAULT_SETTINGS, ...(await get("settings", {})) }; }
const base = async () => String((await settings()).apiBase || RANA.DEFAULT_BASE_URL).replace(/\/+$/, "");

async function status() {
  const [account, pending, tip, poll, s] = await Promise.all([get("account", null), get("pending", null), get("tip", null), get("poll", {}), settings()]);
  const everywhere = s.everywhere && (await chrome.permissions.contains({ origins: ["<all_urls>"] }));
  return {
    connected: !!(account && account.token),
    user: account && account.token ? account.user || null : null,
    pending: pending && pending.expiresAt > Date.now() ? { userCode: pending.userCode, verifyUrl: pending.verifyUrl, expiresAt: pending.expiresAt, interval: pending.interval } : null,
    tip,
    poll: { failures: poll.failures || 0, lastPolledAt: poll.lastPolledAt || null, lastError: poll.lastError || null },
    settings: { ...s, everywhere },
    quietNow: RANA.inQuietHours(Date.now(), s.quiet),
  };
}
async function broadcast(message) {
  // The popup and the options page (runtime), and every tab that has the content script.
  chrome.runtime.sendMessage(message).catch(() => {});
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch { /* no tabs */ }
  for (const t of tabs) if (t.id !== undefined) chrome.tabs.sendMessage(t.id, message).catch(() => {});
}
async function announce(reason) { await broadcast({ type: "status", status: await status(), reason }); }

/* ── HTTP ── */
async function post(path, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch((await base()) + path, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
}
const asJson = async (res) => { try { return await res.json(); } catch { return {}; } };

/* ── account: device-code flow (§4) ── */
async function accountStart() {
  await set({ pending: null });
  let name = "Chrome";
  try { name = `Chrome on ${navigator.userAgentData?.platform || navigator.platform || "this computer"}`; } catch { /* keep */ }
  const res = await post("/api/auth/device/start", { client: "rana-extension", name: name.slice(0, 80) });
  const body = await asJson(res);
  if (!res.ok || !body.deviceCode) throw new Error(body.message || `could not start sign-in (${res.status})`);
  const interval = Math.max(1, Number(body.interval) || 5);
  const pending = { deviceCode: body.deviceCode, userCode: body.userCode, verifyUrl: body.verifyUrl || "", interval, expiresAt: Date.now() + Math.max(30, Number(body.expiresIn) || 600) * 1000 };
  await set({ pending });
  // The options page ticks every `interval` seconds while it is open; this alarm carries on if it closes (Chrome's floor is 30 s).
  chrome.alarms.create(ALARM_DEVICE, { periodInMinutes: 0.5 });
  await announce("pending");
  return { userCode: pending.userCode, verifyUrl: pending.verifyUrl, interval, expiresAt: pending.expiresAt };
}
async function accountPoll() {
  const p = await get("pending", null);
  if (!p) { chrome.alarms.clear(ALARM_DEVICE); return "idle"; }
  if (Date.now() >= p.expiresAt) { await set({ pending: null }); chrome.alarms.clear(ALARM_DEVICE); await announce("expired"); return "expired"; }
  let res, body;
  try { res = await post("/api/auth/device/poll", { deviceCode: p.deviceCode }); body = await asJson(res); }
  catch (e) { log("device poll: network", e.message); return "pending"; }
  if (res.ok && body.status === "approved" && body.token) {
    await set({ pending: null, account: { user: body.user || null, token: body.token, refreshToken: body.refreshToken || null, connectedAt: new Date().toISOString() }, poll: { failures: 0, since: null } });
    chrome.alarms.clear(ALARM_DEVICE);
    await announce("approved");
    pollGuidance(); // the welcome tip
    return "approved";
  }
  if (res.status === 410 || body.status === "expired") { await set({ pending: null }); chrome.alarms.clear(ALARM_DEVICE); await announce("expired"); return "expired"; }
  if (res.status === 403 || body.status === "denied") { await set({ pending: null }); chrome.alarms.clear(ALARM_DEVICE); await announce("denied"); return "denied"; }
  if (res.status === 429) {
    // Asked to slow down (the contract allows 60 polls an hour per code): widen the interval, as the desktop does,
    // and tell the options page so it re-creates its poll timer from `pending.interval`.
    p.interval = Math.max(1, Number(p.interval) || 5) + 5;
    await set({ pending: p });
    await announce("pending");
  }
  return "pending";
}
async function accountCancel() { await set({ pending: null }); chrome.alarms.clear(ALARM_DEVICE); await announce("cancelled"); }
async function accountDisconnect() {
  const a = await get("account", null);
  if (a && a.token) {
    try { await fetch((await base()) + "/api/auth/device", { method: "DELETE", headers: { authorization: `Bearer ${a.token}` }, signal: AbortSignal.timeout(20_000) }); }
    catch (e) { log("revoke: network", e.message); }
  }
  await set({ account: null, pending: null, tip: null });
  chrome.alarms.clear(ALARM_DEVICE);
  await setBadge(false);
  await announce("disconnected");
}
let refreshing = null;
async function refreshTokens() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const a = await get("account", null);
    if (!a || !a.refreshToken) { await set({ account: null }); await announce("signed-out"); return false; }
    let res, body;
    try { res = await post("/api/auth/device/refresh", { refreshToken: a.refreshToken }); body = await asJson(res); }
    catch (e) { log("refresh: network", e.message); return false; }
    if (res.ok && body.token) { await set({ account: { ...a, token: body.token, refreshToken: body.refreshToken || a.refreshToken } }); return true; }
    if ([400, 401, 403, 410].includes(res.status)) { await set({ account: null, tip: null }); await setBadge(false); await announce("signed-out"); }
    return false;
  })().finally(() => { refreshing = null; });
  return refreshing;
}
/** Bearer fetch with one refresh on 401; throws when not signed in. */
async function authFetch(path, init = {}) {
  let a = await get("account", null);
  if (!a || !a.token) throw new Error("not signed in");
  const withAuth = (token) => ({ ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  let res = await fetch((await base()) + path, withAuth(a.token));
  if (res.status !== 401) return res;
  if (!(await refreshTokens())) throw new Error("session ended");
  a = await get("account", null);
  return fetch((await base()) + path, withAuth(a.token));
}

/* ── guidance (§3) on alarms ── */
async function setBadge(on) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#8A4BF5" });
    await chrome.action.setBadgeText({ text: on ? "1" : "" });
  } catch { /* no action */ }
}
function arm(seconds) {
  const s = RANA.clamp(Number(seconds) || 120, RANA.NEXT_MIN, RANA.NEXT_MAX);
  chrome.alarms.create(ALARM_GUIDANCE, { delayInMinutes: s / 60 });
}
const backoff = (failures) => Math.min(RANA.NEXT_MAX, 60 * 2 ** RANA.clamp(failures - 1, 0, 4));
let polling = null;
async function pollGuidance() {
  if (polling) return polling;
  polling = (async () => {
    const st = await status();
    const poll = await get("poll", {});
    // Signed out or tips off: nothing to ask and no alarm to re-arm — the approval (accountPoll) and the
    // tips switch (save-settings) start the polling again. Quiet hours are not skipped: the poll runs on
    // `next` and RANA.gate holds the tips, so the quiet-hours-exempt welcome still arrives (as on the desktop).
    if (!st.connected || !st.settings.tips) return { skipped: true };
    let res, body;
    try {
      const q = poll.since ? `?since=${encodeURIComponent(poll.since)}` : "";
      res = await authFetch(`/api/companion/guidance${q}`);
      body = res.ok ? await res.json() : null;
    } catch (e) { log("guidance:", e.message); res = null; body = { message: e.message }; }
    if (!res || !res.ok || !body || typeof body !== "object") {
      const failures = (poll.failures || 0) + 1;
      await set({ poll: { ...poll, failures, lastPolledAt: Date.now(), lastError: res ? `HTTP ${res.status}` : (body && body.message) || "network" } });
      arm(backoff(failures));
      return { error: true };
    }
    const next = RANA.clamp(Number(body.next) || 120, RANA.NEXT_MIN, RANA.NEXT_MAX);
    const update = { ...poll, failures: 0, lastPolledAt: Date.now(), lastError: null };
    const tip = body.tip;
    if (tip && tip.id && tip.text) {
      update.since = new Date().toISOString();
      const g = await get("gate", {});
      const verdict = RANA.gate(tip, Date.now(), g, st.settings);
      if (verdict.ok) {
        g.lastShown = { ...(g.lastShown || {}), [tip.kind || "nudge"]: Date.now() };
        await set({ tip: { id: tip.id, text: String(tip.text).slice(0, 500), kind: tip.kind || "nudge", action: tip.action && tip.action.url && tip.action.label ? { label: String(tip.action.label).slice(0, 60), url: String(tip.action.url) } : null, at: Date.now() }, gate: g });
        await setBadge(true);
        await broadcast({ type: "tip", tip: await get("tip", null) });
      } else log(`tip ${tip.id} held: ${verdict.reason}`);
    }
    await set({ poll: update });
    arm(next);
    return { tip: tip || null, next };
  })().finally(() => { polling = null; });
  return polling;
}
/* ── feedback (§6) ── */
async function feedback(tipId, verdict) {
  if (!["ok", "later", "never"].includes(verdict)) return false;
  const [tip, g] = await Promise.all([get("tip", null), get("gate", {})]);
  if (verdict === "later") g.snoozedUntil = Date.now() + RANA.LATER_MS;
  if (verdict === "never") g.neverUntil = { ...(g.neverUntil || {}), [(tip && tip.id === tipId && tip.kind) || "nudge"]: Date.now() + RANA.NEVER_MS };
  await set({ gate: g, tip: null });
  await setBadge(false);
  await broadcast({ type: "tip", tip: null });
  if (!tipId) return true;
  try {
    const res = await authFetch("/api/companion/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tipId, verdict }) });
    return res.ok;
  } catch (e) { log("feedback:", e.message); return false; }
}

/* ── the "everywhere" content script, registered at runtime after the person opts in ── */
async function syncEverywhere() {
  const s = await settings();
  const granted = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  const registered = (await chrome.scripting.getRegisteredContentScripts({ ids: [EVERYWHERE_ID] })).length > 0;
  if (s.everywhere && granted && !registered) {
    await chrome.scripting.registerContentScripts([{
      id: EVERYWHERE_ID,
      matches: ["<all_urls>"],
      excludeMatches: ["https://*.exzellent.co/*"], // the manifest's script already runs there
      js: ["vendor/exzi-character.js", "lib/common.js", "content.js"],
      runAt: "document_idle",
      persistAcrossSessions: true,
    }]);
  } else if ((!s.everywhere || !granted) && registered) {
    await chrome.scripting.unregisterContentScripts({ ids: [EVERYWHERE_ID] });
  }
  return s.everywhere && granted;
}

/* ── lifecycle ── */
async function boot() {
  await setBadge(!!(await get("tip", null)));
  const have = await chrome.alarms.get(ALARM_GUIDANCE);
  if (!have) arm(30);
  if (await get("pending", null)) chrome.alarms.create(ALARM_DEVICE, { periodInMinutes: 0.5 });
  try { await syncEverywhere(); } catch (e) { log("everywhere:", e.message); }
}
chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_GUIDANCE) pollGuidance();
  else if (alarm.name === ALARM_DEVICE) accountPoll();
});
chrome.permissions.onRemoved.addListener(() => { syncEverywhere().catch(() => {}); });

/* ── messages from the content script, the popup and the options page ── */
const handlers = {
  "get-status": () => status(),
  "get-tip": async () => ({ tip: await get("tip", null), quietNow: RANA.inQuietHours(Date.now(), (await settings()).quiet) }),
  "feedback": (m) => feedback(m.tipId || null, m.verdict),
  "poll-now": () => pollGuidance(),
  "account-start": () => accountStart(),
  "account-poll": () => accountPoll(),
  "account-cancel": () => accountCancel(),
  "account-disconnect": () => accountDisconnect(),
  "save-settings": async (m) => {
    const prev = await settings();
    const next = { ...prev, ...(m.settings || {}) };
    next.apiBase = String(next.apiBase || "").trim().replace(/\/+$/, "") || RANA.DEFAULT_BASE_URL;
    await set({ settings: next });
    const everywhere = await syncEverywhere();
    if (next.tips && !prev.tips) pollGuidance();
    await announce("settings");
    return { ...next, everywhere };
  },
  "open-options": async () => { await chrome.runtime.openOptionsPage(); return true; },
  "open-url": async (m) => {
    const url = RANA.safeUrl(m.url, (await settings()).apiBase);
    if (url) await chrome.tabs.create({ url });
    return !!url;
  },
  "hide-today": async () => {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    await set({ hiddenUntil: end.getTime() });
    await broadcast({ type: "hidden", until: end.getTime() });
    return end.getTime();
  },
};
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const fn = message && handlers[message.type];
  if (!fn) return false;
  Promise.resolve()
    .then(() => fn(message))
    .then((result) => sendResponse({ ok: true, result }))
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true; // async
});
