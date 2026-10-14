import { test } from "node:test";
import assert from "node:assert/strict";
import { TipGate, createGuidance, inQuietHours, backoff, NEXT_MIN, NEXT_MAX } from "../src/guidance.js";

const MIN = 60_000;
const at = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
const T0 = at(10); // a quiet-free 10:00

/* A fake account: connected or not, answering scripted responses in order. */
function fakeAccount({ connected = true, responses = [] } = {}) {
  const calls = [];
  return {
    calls,
    status: () => ({ connected }),
    fetch: async (path, init) => {
      calls.push({ path, init: init || {} });
      const r = responses.shift();
      if (!r) throw new Error("no scripted response");
      if (r instanceof Error) throw r;
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
    },
  };
}
/* A manual scheduler: nothing runs until the test says so. */
function scheduler() {
  const plans = [];
  return { plans, schedule: (fn, ms) => { plans.push({ fn, ms }); return plans.length; }, cancel: () => {}, last: () => plans.at(-1) };
}

test("quiet hours wrap midnight like the SignalEngine's", () => {
  assert.equal(inQuietHours(at(23, 50), 23.75, 7), true);
  assert.equal(inQuietHours(at(3), 23.75, 7), true);
  assert.equal(inQuietHours(at(7, 1), 23.75, 7), false);
  assert.equal(inQuietHours(at(12), 23.75, 7), false);
  assert.equal(inQuietHours(at(12), 0, 0), false, "from == to means no quiet hours");
  assert.equal(inQuietHours(at(13), 12, 14), true, "a same-day window");
});

test("TipGate: quiet hours, one per kind per 8 minutes, Later snoozes 30 minutes, Never holds a kind for a day", () => {
  const g = new TipGate();
  const nudge = { id: "a", kind: "nudge", text: "x" };
  const lesson = { id: "b", kind: "lesson", text: "y" };
  assert.equal(g.allow(nudge, at(23, 50)).reason, "quiet");
  assert.equal(g.allow({ id: "w", kind: "welcome", text: "hi" }, at(23, 50)).ok, true, "the welcome tip is not held by quiet hours");
  assert.equal(g.allow(nudge, T0).ok, true);
  g.shown(nudge, T0);
  assert.equal(g.allow(nudge, T0 + 3 * MIN).reason, "cooldown");
  assert.equal(g.allow(lesson, T0 + 3 * MIN).ok, true, "another kind passes");
  assert.equal(g.allow(nudge, T0 + 9 * MIN).ok, true);
  g.later(T0 + 9 * MIN);
  assert.equal(g.allow(lesson, T0 + 20 * MIN).reason, "snoozed");
  assert.equal(g.allow(lesson, T0 + 40 * MIN).ok, true);
  g.never("lesson", T0 + 40 * MIN);
  assert.equal(g.allow(lesson, T0 + 5 * 60 * MIN).reason, "never");
  assert.equal(g.allow(nudge, T0 + 5 * 60 * MIN).ok, true);
  assert.equal(g.allow(lesson, T0 + 25 * 60 * MIN).ok, true);
  assert.equal(g.allow({ id: "e", kind: "nudge", text: "" }, T0).reason, "empty");
});

test("backoff doubles from 60 s and stops at 600 s", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(backoff), [60_000, 120_000, 240_000, 480_000, 600_000, 600_000]);
});

test("poll delivers a tip, plans `next` clamped to 30..600 s, and sends `since` from then on", async () => {
  const tip = { id: "tip-1", text: "Your streak is 4 days.", kind: "streak" };
  const account = fakeAccount({ responses: [
    { status: 200, body: { state: { buddy: "minimized", page: "/student-dashboard", at: "x" }, tip, next: 5 } },
    { status: 200, body: { state: null, tip: null, next: 9999 } },
    { status: 200, body: { state: null, tip: null, next: 120 } },
  ] });
  const s = scheduler();
  const tips = [];
  const g = createGuidance({ account, onTip: (t) => tips.push(t), now: () => T0, ...s });
  g.start(); // polls at once; let it finish
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(tips, [tip]);
  assert.equal(account.calls[0].path, "/api/companion/guidance", "first ask has no since");
  assert.equal(s.last().ms, NEXT_MIN * 1000, "next below 30 s is raised to 30 s");
  assert.equal(g.lastTip, tip);

  const r2 = await g.poll();
  assert.equal(account.calls[1].path, `/api/companion/guidance?since=${encodeURIComponent(new Date(T0).toISOString())}`);
  assert.equal(r2.delivered, false);
  assert.equal(s.last().ms, NEXT_MAX * 1000, "next above 600 s is lowered to 600 s");
  await g.poll();
  assert.equal(s.last().ms, 120_000);
  assert.equal(tips.length, 1);
});

test("errors back off (60, 120 s …) and a success resets; signed out or disabled means no fetch and a look again in a minute", async () => {
  const account = fakeAccount({ responses: [new Error("ECONNRESET"), { status: 503, body: { message: "down" } }, { status: 200, body: { tip: null, next: 60 } }] });
  const s = scheduler();
  const g = createGuidance({ account, now: () => T0, ...s });
  g.start();
  await new Promise((r) => setImmediate(r));
  assert.equal(g.failures, 1);
  assert.equal(s.last().ms, 60_000);
  await g.poll();
  assert.equal(g.failures, 2);
  assert.equal(s.last().ms, 120_000);
  await g.poll();
  assert.equal(g.failures, 0);
  assert.equal(s.last().ms, 60_000);

  const out = fakeAccount({ connected: false });
  const s2 = scheduler();
  const g2 = createGuidance({ account: out, now: () => T0, ...s2 });
  g2.start();
  await new Promise((r) => setImmediate(r));
  assert.equal(out.calls.length, 0);
  assert.equal(s2.last().ms, 60_000);

  let enabled = false;
  const s3 = scheduler();
  const in3 = fakeAccount({ responses: [{ status: 200, body: { tip: null, next: 60 } }] });
  const g3 = createGuidance({ account: in3, isEnabled: () => enabled, now: () => T0, ...s3 });
  g3.start();
  await new Promise((r) => setImmediate(r));
  assert.equal(in3.calls.length, 0, "paused: no fetch");
  enabled = true;
  await g3.poll();
  assert.equal(in3.calls.length, 1);
  g3.stop();
  assert.equal(await g3.poll(), null, "stopped: nothing runs");
});

test("a tip held by the gate is not forwarded; feedback posts the verdict and Later/Never change the gate", async () => {
  const tip = { id: "tip-9", text: "Bedtime.", kind: "break" };
  const account = fakeAccount({ responses: [
    { status: 200, body: { tip, next: 60 } },
    { status: 204, body: null },
    { status: 204, body: null },
    { status: 200, body: { tip: { ...tip, id: "tip-10" }, next: 60 } },
  ] });
  const s = scheduler();
  const tips = [];
  const gate = new TipGate({ quietFrom: 0, quietTo: 0 });
  const g = createGuidance({ account, gate, onTip: (t) => tips.push(t), now: () => T0, ...s });
  g.start();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(tips, [tip]);

  assert.equal(await g.feedback("tip-9", "later"), true);
  const fb = account.calls[1];
  assert.equal(fb.path, "/api/companion/feedback");
  assert.equal(fb.init.method, "POST");
  assert.deepEqual(JSON.parse(fb.init.body), { tipId: "tip-9", verdict: "later" });
  assert.equal(gate.allow({ id: "z", kind: "nudge", text: "q" }, T0 + MIN).reason, "snoozed");

  assert.equal(await g.feedback("tip-9", "never"), true);
  assert.deepEqual(JSON.parse(account.calls[2].init.body), { tipId: "tip-9", verdict: "never" });
  assert.equal(gate.allow({ id: "z", kind: "break", text: "q" }, T0 + 60 * MIN).reason, "never", "that kind is held for a day");

  const r = await g.poll();
  assert.equal(r.delivered, false, "the held kind does not reach the bubble");
  assert.equal(tips.length, 1);
  assert.equal(await g.feedback("tip-9", "maybe"), false, "unknown verdicts go nowhere");
  assert.equal(await g.feedback(null, "ok"), true, "a local line needs no backend call");
  assert.equal(account.calls.length, 4);
});
