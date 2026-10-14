/**
 * Exi signal engine — pure logic, no Electron imports (unit-tested in test/).
 * Input every few seconds: { app, title, idleSec } → emits reverse-prompt
 * events with per-type cooldowns. All processing is local; only signals
 * (category, minutes, counts) ever leave this module — never raw content.
 */

const APP_RULES = [
  { cat: "code",    apps: ["code", "webstorm", "idea", "pycharm", "sublime", "cursor", "zed", "vim", "terminal", "powershell", "iterm", "windowsterminal", "cmd"] },
  { cat: "docs",    apps: ["winword", "word", "libreoffice", "acrobat", "acrord", "preview", "notion", "obsidian", "onenote", "evernote", "sumatrapdf", "foxit"] },
  { cat: "study",   apps: ["anki"] },
  { cat: "comms",   apps: ["slack", "teams", "discord", "whatsapp", "telegram", "signal", "thunderbird", "outlook", "mail"] },
  { cat: "design",  apps: ["figma", "photoshop", "illustrator", "canva", "gimp", "affinity"] },
  { cat: "media",   apps: ["spotify", "vlc", "music", "itunes"] },
];

const TITLE_RULES = [
  { cat: "social", words: ["instagram", "tiktok", "facebook", "twitter", " x ", "reddit", "snapchat", "threads"] },
  { cat: "media",  words: ["youtube", "netflix", "twitch", "disney+", "prime video"] },
  { cat: "study",  words: ["chapter", "kapitel", "lecture", "vorlesung", "exam", "klausur", "anki", "flashcard", "cefr", "grammar", "vokabel", "tutorial", "course", "kurs", "duolingo", "exzellent"] },
  { cat: "docs",   words: [".pdf", ".docx", "thesis", "essay", "hausarbeit", "google docs", "overleaf"] },
  { cat: "ai",     words: ["chatgpt", "claude", "gemini", "copilot", "groq"] },
  { cat: "comms",  words: ["gmail", "posteingang", "inbox", "web.whatsapp"] },
];

export function classify(appName = "", title = "") {
  const a = String(appName).toLowerCase().replace(/\.exe$/, "");
  const t = ` ${String(title).toLowerCase()} `;
  for (const r of TITLE_RULES) if (r.words.some((w) => t.includes(w))) return r.cat;
  for (const r of APP_RULES) if (r.apps.some((w) => a.includes(w))) return r.cat;
  if (["chrome", "edge", "msedge", "firefox", "safari", "arc", "brave", "opera"].some((b) => a.includes(b))) return "browse";
  return "other";
}

export const FOCUS_CATS = new Set(["code", "docs", "study", "design", "ai"]);
export const DRIFT_CATS = new Set(["social", "media"]);

const MIN = 60_000;

export const DEFAULT_COOLDOWNS = {
  focus_streak: 30 * MIN,
  deep_focus: 50 * MIN,
  rapid_switching: 12 * MIN,
  social_drift: 20 * MIN,
  late_night: 45 * MIN,
  idle_return: 10 * MIN,
  morning_hello: 6 * 60 * MIN,
  doc_grind: 45 * MIN,
  break_over: 15 * MIN,
};

export class SignalEngine {
  constructor(opts = {}) {
    this.quietFrom = opts.quietFrom ?? 23.75; // no proactive prompts after 23:45…
    this.quietTo = opts.quietTo ?? 7;         // …until 07:00 (except late_night itself)
    this.cooldowns = { ...DEFAULT_COOLDOWNS, ...(opts.cooldowns ?? {}) };
    this.reset();
  }

  reset() {
    this.cat = null;
    this.catSince = null;
    this.title = "";
    this.titleSince = null;
    this.switches = [];       // timestamps of category switches
    this.idleFrom = null;
    this.lastFired = {};      // eventType -> ts
    this.sawActivityToday = null; // date string
    this.driftSince = null;
  }

  _fire(type, now, data = {}) {
    const last = this.lastFired[type] ?? 0;
    if (now - last < (this.cooldowns[type] ?? 0)) return null;
    this.lastFired[type] = now;
    return { type, at: now, ...data };
  }

  _hour(now) {
    const d = new Date(now);
    return d.getHours() + d.getMinutes() / 60;
  }

  _inQuietHours(now) {
    const h = this._hour(now);
    return this.quietFrom > this.quietTo
      ? (h >= this.quietFrom || h < this.quietTo)
      : (h >= this.quietFrom && h < this.quietTo);
  }

  /** sample: { app, title, idleSec } — returns { state, events[] } */
  ingest(sample, now = Date.now()) {
    const events = [];
    const idleSec = sample.idleSec ?? 0;

    // ── idle handling ──
    if (idleSec >= 300) {
      if (this.idleFrom === null) this.idleFrom = now - idleSec * 1000;
      this.cat = null; this.catSince = null; this.driftSince = null;
      return { state: this.state(now, "idle"), events };
    }
    if (this.idleFrom !== null) {
      const awayMin = Math.round((now - this.idleFrom) / MIN);
      this.idleFrom = null;
      if (awayMin >= 5) {
        const e = this._fire("idle_return", now, { awayMin });
        if (e) events.push(e);
      }
    }

    // ── first activity of the day ──
    const day = new Date(now).toDateString();
    if (this.sawActivityToday !== day) {
      this.sawActivityToday = day;
      const h = this._hour(now);
      if (h >= 5 && h < 12) {
        const e = this._fire("morning_hello", now, {});
        if (e) events.push(e);
      }
    }

    // ── categorize ──
    const cat = classify(sample.app, sample.title);
    if (cat !== this.cat) {
      this.switches.push(now);
      this.switches = this.switches.filter((t) => now - t < 3 * MIN);
      this.cat = cat;
      this.catSince = now;
      if (DRIFT_CATS.has(cat)) { if (this.driftSince === null) this.driftSince = now; }
      else this.driftSince = null;
      // rapid app/category switching → scattered
      if (this.switches.length >= 8) {
        const e = this._fire("rapid_switching", now, { switches: this.switches.length });
        if (e) { events.push(e); this.switches = []; }
      }
    }
    if (sample.title !== this.title) {
      this.title = sample.title || "";
      this.titleSince = now;
    }

    const streakMin = this.catSince ? (now - this.catSince) / MIN : 0;
    const titleMin = this.titleSince ? (now - this.titleSince) / MIN : 0;
    const quiet = this._inQuietHours(now);

    // ── late night wind-down (allowed inside quiet hours) ──
    const h = this._hour(now);
    if (h >= 23.5 || h < 4.5) {
      const e = this._fire("late_night", now, { hour: Math.floor(h) });
      if (e) events.push(e);
    }

    if (!quiet) {
      // ── focus streaks on focus categories ──
      if (FOCUS_CATS.has(this.cat)) {
        if (streakMin >= 50) {
          const e = this._fire("deep_focus", now, { cat: this.cat, minutes: Math.round(streakMin) });
          if (e) events.push(e);
        } else if (streakMin >= 25) {
          const e = this._fire("focus_streak", now, { cat: this.cat, minutes: Math.round(streakMin) });
          if (e) events.push(e);
        }
        // grinding one document/page for a long time
        if (titleMin >= 40 && this.title) {
          const e = this._fire("doc_grind", now, { title: this.title.slice(0, 60), minutes: Math.round(titleMin) });
          if (e) events.push(e);
        }
      }
      // ── social/media drift during working hours ──
      if (this.driftSince !== null && h >= 9 && h < 18) {
        const driftMin = (now - this.driftSince) / MIN;
        if (driftMin >= 15) {
          const e = this._fire("social_drift", now, { cat: this.cat, minutes: Math.round(driftMin) });
          if (e) { events.push(e); this.driftSince = now; }
        }
      }
    }

    return { state: this.state(now, "active"), events };
  }

  state(now = Date.now(), mode = "active") {
    return {
      mode,
      category: this.cat,
      streakMin: this.catSince ? Math.round((now - this.catSince) / MIN) : 0,
      switches3m: this.switches.length,
      title: this.title,
    };
  }
}
