/**
 * The extension's service worker (extension/background.js) against a small stand-in for
 * chrome.* and fetch: the device-code poll and its 429 slow-down, and when the guidance
 * poll fetches, arms its alarm, holds a tip or lets it through.
 *
 *   npm test   (at the root: node --test "test/*.test.mjs")
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ext = join(dirname(fileURLToPath(import.meta.url)), "..", "extension");
const src = (f) => readFileSync(join(ext, f), "utf8");
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Load background.js (and, through importScripts, lib/common.js) into a fresh context with a fake chrome. */
function boot() {
  const storage = new Map();
  const alarms = new Map();
  const listeners = { message: [], alarm: [] };
  const sent = [];     // chrome.runtime.sendMessage broadcasts (what the popup and the options page receive)
  const fetches = [];  // every fetch: { url, init }
  const badge = { text: null };
  let respond = () => reply(500, {});
  const chrome = {
    storage: { local: {
      get: async (key) => { const out = {}; for (const k of Array.isArray(key) ? key : [key]) if (storage.has(k)) out[k] = structuredClone(storage.get(k)); return out; },
      set: async (obj) => { for (const [k, v] of Object.entries(obj)) storage.set(k, structuredClone(v)); },
    } },
    alarms: {
      create: (name, info) => { alarms.set(name, { ...info }); },
      clear: async (name) => alarms.delete(name),
      get: async (name) => (alarms.has(name) ? { name, ...alarms.get(name) } : undefined),
      onAlarm: { addListener: (fn) => listeners.alarm.push(fn) },
    },
    action: { setBadgeBackgroundColor: async () => {}, setBadgeText: async ({ text }) => { badge.text = text; } },
    permissions: { contains: async () => false, onRemoved: { addListener: () => {} } },
    scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {}, unregisterContentScripts: async () => {} },
    runtime: {
      sendMessage: async (m) => { sent.push(structuredClone(m)); },
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onMessage: { addListener: (fn) => listeners.message.push(fn) },
      openOptionsPage: async () => {},
    },
    tabs: { query: async () => [], sendMessage: async () => {}, create: async () => {} },
  };
  const ctx = createContext({
    chrome,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    fetch: async (url, init) => { fetches.push({ url: String(url), init }); return respond(String(url), init); },
    AbortSignal, URL, structuredClone, setTimeout, clearTimeout, setImmediate,
  });
  ctx.importScripts = (...files) => { for (const f of files) runInContext(src(f), ctx, { filename: f }); };
  runInContext(src("background.js"), ctx, { filename: "background.js" });
  assert.equal(listeners.message.length, 1, "background.js registers one onMessage listener");
  const ask = (message) => new Promise((resolve) => { listeners.message[0](message, {}, resolve); });
  return {
    storage, alarms, sent, fetches, badge, ask,
    setFetch: (fn) => { respond = fn; },
    statuses: (reason) => sent.filter((m) => m.type === "status" && m.reason === reason),
  };
}

const future = () => Date.now() + 600_000;
const connected = (w) => w.storage.set("account", { user: { name: "Rio" }, token: "tok", refreshToken: "ref", connectedAt: "2026-10-14T00:00:00.000Z" });

test("device poll: a 429 widens the interval by 5 s and tells the options page; a plain pending leaves it alone", async () => {
  const w = boot();
  w.storage.set("pending", { deviceCode: "d1", userCode: "KX7M-3RQB", verifyUrl: "https://www.exzellent.co/student-dashboard/rana?code=KX7M-3RQB", interval: 5, expiresAt: future() });
  w.setFetch(() => reply(429, { status: "pending", message: "slow down" }));
  assert.equal((await w.ask({ type: "account-poll" })).result, "pending");
  assert.equal(w.storage.get("pending").interval, 10, "5 s more after the first 429");
  assert.equal(w.statuses("pending").length, 1, "the options page is told so it re-creates its poll timer");
  assert.equal(w.statuses("pending")[0].status.pending.interval, 10);
  assert.equal((await w.ask({ type: "account-poll" })).result, "pending");
  assert.equal(w.storage.get("pending").interval, 15, "and 5 s more after the second");
  assert.equal(w.statuses("pending").length, 2);

  w.setFetch(() => reply(200, { status: "pending" }));
  assert.equal((await w.ask({ type: "account-poll" })).result, "pending");
  assert.equal(w.storage.get("pending").interval, 15, "a plain pending keeps the interval");
  assert.equal(w.statuses("pending").length, 2, "and says nothing new");
  assert.equal(w.fetches.length, 3);
  assert.ok(w.fetches.every((f) => f.url.endsWith("/api/auth/device/poll")));
});

test("device poll: approval stores the account, ends the pending code and asks for the welcome tip", async () => {
  const w = boot();
  w.storage.set("pending", { deviceCode: "d1", userCode: "KX7M-3RQB", verifyUrl: "", interval: 5, expiresAt: future() });
  w.setFetch((url) => url.endsWith("/api/auth/device/poll")
    ? reply(200, { status: "approved", token: "t1", refreshToken: "r1", user: { name: "Rio Weber" } })
    : reply(200, { state: {}, tip: { id: "w1", text: "Welcome back, Rio", kind: "welcome" }, next: 120 }));
  assert.equal((await w.ask({ type: "account-poll" })).result, "approved");
  await settle();
  assert.equal(w.storage.get("pending"), null);
  assert.equal(w.storage.get("account").token, "t1");
  assert.equal(w.statuses("approved").length, 1);
  const guidance = w.fetches.filter((f) => f.url.includes("/api/companion/guidance"));
  assert.equal(guidance.length, 1, "the approval polls the guidance once (the welcome)");
  assert.equal(guidance[0].init.headers.authorization, "Bearer t1");
  assert.equal(w.storage.get("tip").id, "w1");
  assert.equal(w.badge.text, "1");
  assert.equal(w.alarms.get("rana-guidance").delayInMinutes, 2, "next = 120 s");
});

test("guidance: signed out or tips off means no fetch and no alarm; turning tips on polls again", async () => {
  const w = boot();
  w.setFetch(() => reply(200, { state: {}, tip: null, next: 300 }));
  assert.equal((await w.ask({ type: "poll-now" })).result.skipped, true); // (a vm-realm object: compare the field, not the prototype)
  assert.equal(w.fetches.length, 0, "signed out: nothing to ask");
  assert.equal(w.alarms.has("rana-guidance"), false, "and no alarm to wake the worker for nothing");

  connected(w);
  w.storage.set("settings", { tips: false });
  assert.equal((await w.ask({ type: "poll-now" })).result.skipped, true); // (a vm-realm object: compare the field, not the prototype)
  assert.equal(w.fetches.length, 0, "tips off: nothing to ask");
  assert.equal(w.alarms.has("rana-guidance"), false);

  await w.ask({ type: "save-settings", settings: { tips: true } });
  await settle();
  assert.equal(w.fetches.length, 1, "tips on again: one poll straight away");
  assert.equal(w.alarms.get("rana-guidance").delayInMinutes, 5, "armed from the backend's next (300 s)");
});

test("guidance: quiet hours do not skip the poll; the gate holds a nudge and lets the welcome through", async () => {
  const w = boot();
  connected(w);
  w.storage.set("settings", { quiet: { from: 0, to: 24 } }); // always quiet
  w.setFetch(() => reply(200, { state: {}, tip: { id: "n1", text: "Ten minutes of algebra?", kind: "nudge" }, next: 240 }));
  const r1 = (await w.ask({ type: "poll-now" })).result;
  assert.equal(w.fetches.length, 1, "the poll runs in quiet hours");
  assert.equal(r1.next, 240);
  assert.equal(w.storage.get("tip"), undefined, "the nudge is held, not shown");
  assert.equal(w.badge.text, null);
  assert.equal(w.alarms.get("rana-guidance").delayInMinutes, 4, "armed from next, not a fixed quiet-hours delay");
  assert.ok(w.storage.get("poll").since, "a held tip still advances `since`");

  w.setFetch(() => reply(200, { state: {}, tip: { id: "w1", text: "Welcome back", kind: "welcome" }, next: 90 }));
  await w.ask({ type: "poll-now" });
  assert.equal(w.fetches.length, 2);
  assert.match(w.fetches[1].url, /\/api\/companion\/guidance\?since=/, "the second poll sends since");
  assert.equal(w.storage.get("tip").id, "w1", "welcome is exempt from quiet hours");
  assert.equal(w.badge.text, "1");
  assert.ok(w.sent.some((m) => m.type === "tip" && m.tip && m.tip.id === "w1"), "the content script and popup hear about it");
  assert.equal(w.alarms.get("rana-guidance").delayInMinutes, 1.5);
});

test("guidance: errors back off 60, 120, 240 s and `next` is clamped to 30..600 s", async () => {
  const w = boot();
  connected(w);
  w.setFetch(() => { throw new Error("offline"); });
  await w.ask({ type: "poll-now" });
  assert.equal(w.alarms.get("rana-guidance").delayInMinutes, 1);
  await w.ask({ type: "poll-now" });
  assert.equal(w.alarms.get("rana-guidance").delayInMinutes, 2);
  await w.ask({ type: "poll-now" });
  assert.equal(w.alarms.get("rana-guidance").delayInMinutes, 4);
  assert.equal(w.storage.get("poll").failures, 3);

  w.setFetch(() => reply(200, { state: {}, tip: null, next: 5 }));
  await w.ask({ type: "poll-now" });
  assert.equal(w.storage.get("poll").failures, 0, "a success resets the failures");
  assert.equal(w.alarms.get("rana-guidance").delayInMinutes, 0.5, "next below 30 s is clamped up");
  w.setFetch(() => reply(200, { state: {}, tip: null, next: 99_999 }));
  await w.ask({ type: "poll-now" });
  assert.equal(w.alarms.get("rana-guidance").delayInMinutes, 10, "next above 600 s is clamped down");
});
