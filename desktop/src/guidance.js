/**
 * Guidance from the dashboard (companion-api.md §3 and §6).
 *
 * Polls GET /api/companion/guidance when signed in, waits `next` seconds
 * (30..600) between asks and backs off on errors; a tip goes through the
 * TipGate (quiet hours, one per kind per 8 minutes, "Later" = 30 minutes of
 * quiet, "Not this" = that kind held for 24 hours) before it reaches the
 * bubble; feedback goes to POST /api/companion/feedback.
 *
 * Pure apart from the fetch, which comes from the account: tests drive it
 * with a fake account and a manual scheduler.
 */

const MIN = 60_000;
export const NEXT_MIN = 30;
export const NEXT_MAX = 600;
export const TIP_KINDS = ["nudge", "lesson", "streak", "homework", "break", "welcome"];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const hourOf = (now) => { const d = new Date(now); return d.getHours() + d.getMinutes() / 60; };

/** The same rule as the SignalEngine's quiet hours: from..to in decimal hours, wrapping midnight. */
export function inQuietHours(now, from = 23.75, to = 7) {
  if (from === to) return false;
  const h = hourOf(now);
  return from > to ? h >= from || h < to : h >= from && h < to;
}

/** Seconds→ms to wait after `failures` errors in a row: 60 s, 120, 240, 480, then 600 s. */
export function backoff(failures) {
  return Math.min(NEXT_MAX * 1000, MIN * 2 ** clamp(failures - 1, 0, 4));
}

export class TipGate {
  constructor({ quietFrom = 23.75, quietTo = 7, kindCooldown = 8 * MIN, laterMs = 30 * MIN, neverMs = 24 * 60 * MIN } = {}) {
    this.quietFrom = quietFrom;
    this.quietTo = quietTo;
    this.kindCooldown = kindCooldown;
    this.laterMs = laterMs;
    this.neverMs = neverMs;
    this.lastShown = {};
    this.neverUntil = {};
    this.snoozedUntil = 0;
  }
  setQuiet(from, to) { this.quietFrom = from; this.quietTo = to; }
  /** Why a tip may not show now, or { ok: true }. */
  allow(tip, now = Date.now()) {
    if (!tip || !tip.text) return { ok: false, reason: "empty" };
    const kind = tip.kind || "nudge";
    if (kind !== "welcome" && inQuietHours(now, this.quietFrom, this.quietTo)) return { ok: false, reason: "quiet" };
    if (now < this.snoozedUntil) return { ok: false, reason: "snoozed" };
    if ((this.neverUntil[kind] || 0) > now) return { ok: false, reason: "never" };
    if (now - (this.lastShown[kind] || 0) < this.kindCooldown) return { ok: false, reason: "cooldown" };
    return { ok: true };
  }
  shown(tip, now = Date.now()) { this.lastShown[tip.kind || "nudge"] = now; }
  later(now = Date.now()) { this.snoozedUntil = now + this.laterMs; }
  never(kind, now = Date.now()) { this.neverUntil[kind || "nudge"] = now + this.neverMs; }
}

export function createGuidance({
  account,
  gate = new TipGate(),
  isEnabled = () => true,
  onTip = () => {},
  schedule = setTimeout,
  cancel = clearTimeout,
  now = Date.now,
  idleMs = MIN,
  log = () => {},
} = {}) {
  let timer = null;
  let running = false;
  let failures = 0;
  let since = null;
  let lastTip = null;
  let inflight = null;

  function plan(ms) {
    if (timer) cancel(timer);
    timer = null;
    if (!running) return;
    timer = schedule(() => { timer = null; poll(); }, ms);
  }

  async function poll() {
    if (!running) return null;
    if (inflight) return inflight;
    inflight = (async () => {
      if (!isEnabled() || !account.status().connected) {
        plan(idleMs);
        return { skipped: true };
      }
      let res, body;
      try {
        const q = since ? `?since=${encodeURIComponent(since)}` : "";
        res = await account.fetch(`/api/companion/guidance${q}`);
        body = res.ok ? await res.json() : null;
      } catch (e) {
        log("guidance:", e && e.message);
        res = null;
      }
      if (!res || !res.ok || !body || typeof body !== "object") {
        failures += 1;
        const wait = backoff(failures);
        plan(wait);
        return { error: res ? res.status : "network", wait };
      }
      failures = 0;
      const next = clamp(Number(body.next) || 120, NEXT_MIN, NEXT_MAX) * 1000;
      let delivered = false;
      const tip = body.tip;
      if (tip && tip.id && tip.text) {
        since = new Date(now()).toISOString();
        const verdict = gate.allow(tip, now());
        if (verdict.ok) {
          gate.shown(tip, now());
          lastTip = tip;
          delivered = true;
          onTip(tip, body.state || null);
        } else log(`tip ${tip.id} held: ${verdict.reason}`);
      }
      plan(next);
      return { tip: tip || null, delivered, next, state: body.state || null };
    })().finally(() => { inflight = null; });
    return inflight;
  }

  async function feedback(tipId, verdict) {
    if (!["ok", "later", "never"].includes(verdict)) return false;
    if (verdict === "later") gate.later(now());
    if (verdict === "never") gate.never(lastTip && lastTip.id === tipId ? lastTip.kind : "nudge", now());
    if (!tipId) return true; // a local line, nothing to tell the backend
    try {
      const res = await account.fetch("/api/companion/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipId, verdict }),
      });
      return res.ok;
    } catch (e) {
      log("feedback:", e && e.message);
      return false;
    }
  }

  return {
    start() { if (running) return; running = true; failures = 0; poll(); },
    stop() { running = false; if (timer) cancel(timer); timer = null; },
    /** Ask now (after a sign-in, a resume), without waiting for the timer. */
    poke() { if (!running) return null; if (timer) cancel(timer); timer = null; return poll(); },
    poll,
    feedback,
    get running() { return running; },
    get lastTip() { return lastTip; },
    get failures() { return failures; },
    get since() { return since; },
  };
}
