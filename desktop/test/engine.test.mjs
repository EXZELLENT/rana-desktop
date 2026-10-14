import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, SignalEngine, DEFAULT_COOLDOWNS } from "../src/engine.js";
import { buildMessage } from "../src/messages.js";

const MIN = 60_000;
// fixed "now": a Tuesday 10:00 local
const base = new Date(); base.setHours(10, 0, 0, 0);
const T0 = base.getTime();

test("classify: apps and titles map to sensible categories", () => {
  assert.equal(classify("Code.exe", "engine.ts — exzellent"), "study"); // title word wins (exzellent)
  assert.equal(classify("Code.exe", "main.rs — project"), "code");
  assert.equal(classify("chrome.exe", "Instagram"), "social");
  assert.equal(classify("chrome.exe", "YouTube - lecture 4"), "media");
  assert.equal(classify("AcroRd32.exe", "anatomy-ch4.pdf"), "docs");
  assert.equal(classify("chrome.exe", "Kapitel 3 – Grammatik"), "study");
  assert.equal(classify("Slack.exe", "general"), "comms");
  assert.equal(classify("chrome.exe", "some random page"), "browse");
  assert.equal(classify("Anki.exe", ""), "study");
});

test("focus streak fires at 25m, deep focus at 50m, with cooldowns", () => {
  const e = new SignalEngine();
  let events = [];
  for (let m = 0; m <= 55; m += 1) {
    const { events: ev } = e.ingest({ app: "Code.exe", title: "api.ts" , idleSec: 0 }, T0 + m * MIN);
    events.push(...ev);
  }
  const types = events.map((x) => x.type);
  assert.ok(types.includes("focus_streak"), "focus_streak fired");
  assert.ok(types.includes("deep_focus"), "deep_focus fired");
  assert.equal(types.filter((t) => t === "focus_streak").length, 1, "cooldown respected");
});

test("social drift fires after 15m of social during work hours", () => {
  const e = new SignalEngine();
  e.ingest({ app: "chrome.exe", title: "docs", idleSec: 0 }, T0);
  let fired = [];
  for (let m = 1; m <= 20; m++) {
    const { events } = e.ingest({ app: "chrome.exe", title: "Instagram reels", idleSec: 0 }, T0 + m * MIN);
    fired.push(...events);
  }
  assert.ok(fired.some((x) => x.type === "social_drift"));
});

test("rapid switching fires on 8 category flips in 3 minutes", () => {
  const e = new SignalEngine();
  const apps = [["Code.exe","a"],["chrome.exe","Instagram"],["Slack.exe","x"],["AcroRd32.exe","b.pdf"],["Figma.exe","y"],["chrome.exe","YouTube"],["Code.exe","c"],["Slack.exe","z"],["Anki.exe","deck"]];
  let fired = [];
  apps.forEach(([app, title], i) => {
    const { events } = e.ingest({ app, title, idleSec: 0 }, T0 + i * 15_000);
    fired.push(...events);
  });
  assert.ok(fired.some((x) => x.type === "rapid_switching"));
});

test("idle → sleepy state, return after ≥5m fires idle_return with minutes", () => {
  const e = new SignalEngine();
  e.ingest({ app: "Code.exe", title: "a", idleSec: 0 }, T0);
  const { state } = e.ingest({ app: "Code.exe", title: "a", idleSec: 400 }, T0 + 7 * MIN);
  assert.equal(state.mode, "idle");
  const { events } = e.ingest({ app: "Code.exe", title: "a", idleSec: 2 }, T0 + 9 * MIN);
  const ret = events.find((x) => x.type === "idle_return");
  assert.ok(ret && ret.awayMin >= 5, "idle_return with awayMin");
});

test("quiet hours suppress focus prompts but late_night still fires", () => {
  const e = new SignalEngine();
  const night = new Date(); night.setHours(23, 50, 0, 0);
  let fired = [];
  for (let m = 0; m <= 30; m++) {
    const { events } = e.ingest({ app: "Code.exe", title: "a", idleSec: 0 }, night.getTime() + m * MIN);
    fired.push(...events);
  }
  assert.ok(fired.some((x) => x.type === "late_night"), "late_night fires");
  assert.ok(!fired.some((x) => x.type === "focus_streak"), "focus prompts stay quiet at night");
});

test("messages: every event type renders for every persona and tone", () => {
  const events = [
    { type: "morning_hello" }, { type: "focus_streak", cat: "code", minutes: 25 },
    { type: "deep_focus", cat: "docs", minutes: 52 }, { type: "doc_grind", title: "thesis.docx", minutes: 41 },
    { type: "rapid_switching", switches: 9 }, { type: "social_drift", cat: "social", minutes: 17 },
    { type: "late_night", hour: 23 }, { type: "idle_return", awayMin: 12 },
  ];
  let n = 0;
  for (const persona of ["study", "mentor", "clone", "support"])
    for (const tone of [0, 50, 100])
      for (const ev of events) {
        const m = buildMessage(ev, { name: "Rio", tone, persona, cloneName: "Frau Weber" });
        assert.ok(m.text.length > 10 && m.mood, `${ev.type}/${persona}/${tone}`);
        n++;
      }
  assert.equal(n, 96);
});

test("cooldown table sane", () => {
  for (const [k, v] of Object.entries(DEFAULT_COOLDOWNS)) assert.ok(v >= 5 * MIN, k);
});
