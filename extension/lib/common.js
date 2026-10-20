/* Rana extension — what the service worker, the content script, the popup and
 * the options page share: constants, the fallback spec and small pure helpers.
 * A classic script (importScripts in the worker, a <script> elsewhere). */
globalThis.RANA = (() => {
  const DEFAULT_BASE_URL = "https://exzellent-backend-1.onrender.com";
  const DASHBOARD_URL = "https://www.exzellent.co/student-dashboard";
  const DEFAULT_QUIET = { from: 23.75, to: 7 };
  const MIN = 60_000;
  const NEXT_MIN = 30;
  const NEXT_MAX = 600;
  const KIND_COOLDOWN = 8 * MIN;
  const LATER_MS = 30 * MIN;
  const NEVER_MS = 24 * 60 * MIN;
  // The bundle's RANA_SPEC (the mouse) draws Rana; this spec stands in only for an older bundle without it.
  const FALLBACK_SPEC = {
    meta: { id: "rana", name: "Rana", species: "elephant" },
    colours: { skin: "grey", earInner: "rose", accent: "gold" },
    features: { tusks: false, tuft: false, nameTag: false },
    scarf: "none",
  };
  const DEFAULT_SETTINGS = { everywhere: false, tips: true, quiet: DEFAULT_QUIET, apiBase: DEFAULT_BASE_URL };

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const hourOf = (ts) => { const d = new Date(ts); return d.getHours() + d.getMinutes() / 60; };
  /** The same rule as the desktop app's quiet hours: decimal hours, wrapping midnight. */
  function inQuietHours(now, q = DEFAULT_QUIET) {
    const from = Number(q && q.from), to = Number(q && q.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return false;
    const h = hourOf(now);
    return from > to ? h >= from || h < to : h >= from && h < to;
  }
  /** "23:45" ↔ 23.75 for the options page. */
  const toClock = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
  const fromClock = (s, fallback) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? clamp(Number(m[1]) + Number(m[2]) / 60, 0, 24) : fallback; };
  /** Why a tip may not show now, or { ok: true } — mirrors desktop/src/guidance.js TipGate. */
  function gate(tip, now, g = {}, settings = DEFAULT_SETTINGS) {
    if (!tip || !tip.text) return { ok: false, reason: "empty" };
    const kind = tip.kind || "nudge";
    if (kind !== "welcome" && inQuietHours(now, settings.quiet)) return { ok: false, reason: "quiet" };
    if (now < (g.snoozedUntil || 0)) return { ok: false, reason: "snoozed" };
    if (((g.neverUntil || {})[kind] || 0) > now) return { ok: false, reason: "never" };
    if (now - ((g.lastShown || {})[kind] || 0) < KIND_COOLDOWN) return { ok: false, reason: "cooldown" };
    return { ok: true };
  }
  /** Only Exzellent's pages and the configured backend may be opened from Rana. */
  function safeUrl(url, apiBase) {
    try {
      const u = new URL(String(url));
      let baseHost = "";
      try { baseHost = new URL(apiBase || DEFAULT_BASE_URL).host; } catch { /* no base */ }
      return u.protocol === "https:" && (/(^|\.)exzellent\.co$/.test(u.hostname) || (baseHost && u.host === baseHost)) ? u.href : null;
    } catch { return null; }
  }

  return { DEFAULT_BASE_URL, DASHBOARD_URL, DEFAULT_QUIET, DEFAULT_SETTINGS, FALLBACK_SPEC, MIN, NEXT_MIN, NEXT_MAX, KIND_COOLDOWN, LATER_MS, NEVER_MS, clamp, inQuietHours, toClock, fromClock, gate, safeUrl };
})();
