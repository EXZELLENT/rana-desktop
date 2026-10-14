/* Rana renderer — the character from the bundle, moods, the one bubble shared
 * by local prompts and dashboard tips, drag to move the window; talks to main
 * through the window.rana bridge (preload.cjs). */
(() => {
  const api = window.rana;
  const $ = (id) => document.getElementById(id);
  const root = $("root"), host = $("char"), bub = $("bub"), chip = $("chip");
  const EC = window.ExziCharacter;
  // Until the bundle ships RANA_SPEC (a sibling stream adds the mouse species), Rana is a grey, tuskless elephant.
  const FALLBACK_SPEC = {
    meta: { id: "rana", name: "Rana", species: "elephant" },
    colours: { skin: "grey", earInner: "rose", accent: "gold" },
    features: { tusks: false, tuft: false, nameTag: false },
    scarf: "none",
  };

  window.addEventListener("error", (e) => { try { api.reportError(`${e.message} (${e.filename}:${e.lineno})`); } catch { /* no bridge */ } });

  /* click-through: the window ignores the mouse except over Rana, the bubble, the chip and the toolbar */
  api.setIgnore(true);
  document.addEventListener("mousemove", (e) => {
    const over = e.target && e.target.closest && e.target.closest("#char,#bub,#bar,#chip");
    api.setIgnore(!over);
  });
  document.addEventListener("mouseleave", () => api.setIgnore(true));

  /* the character */
  let buddy;
  try {
    buddy = EC.createCharacter(host, { spec: EC.RANA_SPEC || FALLBACK_SPEC, view: "full", interactive: true, bubble: true, sound: false, roam: 0 });
  } catch (e) {
    api.reportError("character failed: " + (e && e.message));
    throw e;
  }
  let paused = false;
  const hold = (mood, ms = 4000) => buddy.setMood(mood, { hold: ms });

  /* the prototype's prompt moods → the bundle's moods and actions */
  const MOOD = {
    celebrate: () => { hold("excited"); buddy.play("cheer"); },
    stretch: () => { buddy.play("stretch"); },
    loved: () => hold("happy"),
    sleepy: () => buddy.setMood("sleeping"),
    cheeky: () => { hold("shy"); buddy.play("wiggle"); },
    dizzy: () => hold("confused"),
    watching: () => hold("listening"),
    idle: () => buddy.setMood("idle"),
  };
  const TIP_MOOD = {
    welcome: () => { hold("excited"); buddy.play("wave"); },
    streak: () => { hold("proud"); buddy.play("cheer"); },
    lesson: () => { hold("listening"); buddy.play("nod"); },
    homework: () => { hold("thinking"); buddy.play("think-tap"); },
    break: () => { hold("happy"); buddy.play("stretch"); },
    nudge: () => { hold("happy"); buddy.play("wave"); },
  };

  /* the bubble: one at a time; a dashboard tip wins over a local prompt */
  let current = null; // { source: "local" | "tip", tip, timer }
  function hideBubble() {
    if (current) clearTimeout(current.timer);
    current = null;
    bub.style.display = "none";
    bub.textContent = "";
  }
  function showBubble({ source, text, tip = null }) {
    if (source === "local" && current && current.source === "tip") return false;
    if (current) clearTimeout(current.timer);
    bub.textContent = "";
    const who = document.createElement("span");
    who.className = "who" + (source === "tip" ? " tip" : "");
    who.textContent = source === "tip" ? "from your dashboard" : "rana";
    bub.appendChild(who);
    bub.appendChild(document.createTextNode(String(text)));
    const acts = document.createElement("div");
    acts.className = "acts";
    const btn = (label, cls, fn) => { const b = document.createElement("button"); b.textContent = label; if (cls) b.className = cls; b.onclick = fn; acts.appendChild(b); };
    if (tip && tip.action && tip.action.url && tip.action.label) btn(tip.action.label, "", () => { api.openExternal(tip.action.url); verdict("ok"); });
    btn("Okay", "", () => verdict("ok"));
    btn("Later", "g", () => verdict("later"));
    if (source === "tip") btn("Not this", "g", () => verdict("never"));
    bub.appendChild(acts);
    bub.style.display = "block";
    current = { source, tip, timer: setTimeout(hideBubble, source === "tip" ? 90_000 : 25_000) };
    return true;
  }
  function verdict(v) {
    const c = current;
    hideBubble();
    if (!c) return;
    if (c.source === "tip" && c.tip) api.tipFeedback(c.tip.id, v);
    if (v === "ok") { buddy.play("nod"); hold("happy", 1500); }
    else if (v === "never") hold("sad", 1500);
  }

  /* main-process events */
  api.onPrompt((p) => {
    if (paused || !p || !p.text) return;
    if (showBubble({ source: "local", text: p.text })) (MOOD[p.mood] || MOOD.watching)();
  });
  api.onTip((t) => {
    if (!t || !t.text) return;
    showBubble({ source: "tip", text: t.text, tip: t });
    (TIP_MOOD[t.kind] || TIP_MOOD.nudge)();
  });
  api.onState((s) => {
    if (paused) return;
    chip.textContent = "";
    if (s.mode === "idle") chip.textContent = "rana · you're away — napping";
    else if (s.category) {
      chip.appendChild(document.createTextNode("watching: "));
      const g = document.createElement("span"); g.className = "g"; g.textContent = s.category; chip.appendChild(g);
      chip.appendChild(document.createTextNode(` · ${s.streakMin}m`));
    } else chip.textContent = "rana · on watch";
    if (s.mode === "idle") buddy.setMood("sleeping");
    else if (buddy.mood === "sleeping") buddy.setMood("idle");
  });
  api.onPaused((v) => {
    paused = !!v;
    root.classList.toggle("paused", paused);
    chip.textContent = paused ? "rana · paused — looking away" : "rana · back on watch";
    if (paused) { hideBubble(); buddy.setMood("sleeping"); }
    else { buddy.setMood("idle"); hold("listening", 1500); }
  });

  /* toolbar */
  $("bPause").onclick = () => api.togglePause();
  $("bSet").onclick = () => api.openSettings();
  $("bHide").onclick = () => api.hide();

  /* drag to move: the window follows the pointer, so inside the window the pointer stays put and
   * the character is simply carried along (the bundle's own carry pose, legs dangling) */
  let drag = null;
  host.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    drag = { sx: e.screenX, sy: e.screenY, wx: null, wy: null, moved: false };
    api.dragStart().then(([x, y]) => { if (drag) { drag.wx = x; drag.wy = y; } }).catch(() => { drag = null; });
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag || drag.wx === null) return;
    const dx = e.screenX - drag.sx, dy = e.screenY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 7) return;
    drag.moved = true;
    api.dragMove(drag.wx + dx, drag.wy + dy);
  });
  window.addEventListener("pointerup", () => { drag = null; });
  window.addEventListener("pointercancel", () => { drag = null; });

  /* boot */
  api.getSettings().then((s) => {
    paused = !!s.paused;
    root.classList.toggle("paused", paused);
    if (!s.consented) showBubble({ source: "local", text: "hi! I'm Rana 👋 I don't watch anything yet — open ⚙️ to choose what I may see. Everything stays on this computer." });
    else { chip.textContent = "rana · on watch"; buddy.play("wave"); }
    if (paused) buddy.setMood("sleeping");
  }).catch((e) => api.reportError("settings failed: " + (e && e.message)))
    .finally(() => api.ready());
})();
