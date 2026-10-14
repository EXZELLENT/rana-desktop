/* Rana extension — the overlay. A fixed, draggable corner with the character
 * (the bundle runs in this isolated world), the tip bubble with Okay / Later /
 * Not this, hidden while the dashboard's own buddy is open or fullscreen
 * (data-exzi-dock, companion-api.md §5), shown with tips when it is minimized.
 * Styles live in a shadow root so the page and Rana never touch each other. */
(() => {
  if (window.__ranaMounted) return;
  window.__ranaMounted = true;
  const EC = window.ExziCharacter;
  if (!EC || !globalThis.RANA || !document.documentElement) return;
  if (window.top !== window) return; // once per page, not in every iframe

  const onDashboard = /(^|\.)exzellent\.co$/.test(location.hostname);
  const ask = (message) => new Promise((resolve) => {
    try { chrome.runtime.sendMessage(message, (r) => { void chrome.runtime.lastError; resolve(r && r.ok ? r.result : null); }); }
    catch { resolve(null); }
  });

  /* ── the overlay ── */
  const wrap = document.createElement("div");
  wrap.id = "rana-companion";
  wrap.setAttribute("aria-label", "Rana, your Exzellent companion");
  wrap.style.cssText = "position:fixed;right:24px;bottom:24px;width:140px;z-index:2147483646;pointer-events:none;display:none";
  const shadow = wrap.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
<style>
:host{all:initial}
*{box-sizing:border-box;margin:0;padding:0}
#root{display:flex;flex-direction:column;align-items:center;font:13px/1.5 'Segoe UI',Inter,system-ui,sans-serif;color:#EEF1FB}
#bub{pointer-events:auto;max-width:260px;background:color-mix(in srgb,#0F1220 94%,transparent);border:1px solid color-mix(in srgb,#8A4BF5 40%,transparent);border-radius:14px;padding:11px 13px;font-size:12.5px;margin-bottom:8px;display:none;box-shadow:0 14px 40px color-mix(in srgb,#0F1220 55%,transparent);animation:pop .3s cubic-bezier(.16,1,.3,1)}
#bub .who{display:block;font:600 9px Consolas,ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:#F0C442;margin-bottom:4px}
#bub .acts{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
#bub button{font:600 11px 'Segoe UI',system-ui,sans-serif;border:none;border-radius:999px;padding:6px 11px;cursor:pointer;background:#3DF0A0;color:#0F1220}
#bub button.g{background:transparent;border:1px solid color-mix(in srgb,#8A4BF5 40%,transparent);color:#C9AAFF}
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}
#char{pointer-events:auto;width:140px;cursor:grab;filter:drop-shadow(0 12px 26px color-mix(in srgb,#8A4BF5 35%,transparent))}
#char.exzi-char-dragging{cursor:grabbing}
#bar{pointer-events:auto;display:none;gap:6px;margin-top:4px}
#root:hover #bar{display:flex}
#bar button{font-size:11px;width:28px;height:24px;border-radius:8px;border:1px solid color-mix(in srgb,#8A4BF5 35%,transparent);background:color-mix(in srgb,#0F1220 94%,transparent);color:#C9AAFF;cursor:pointer}
#bar button:hover{color:#EEF1FB}
</style>
<div id="root">
  <div id="bub" role="status" aria-live="polite"></div>
  <div id="char"></div>
  <div id="bar">
    <button id="bSet" title="Rana settings">⚙️</button>
    <button id="bHide" title="hide Rana for today">✕</button>
  </div>
</div>`;
  document.documentElement.appendChild(wrap);
  const $ = (id) => shadow.getElementById(id);
  const host = $("char"), bub = $("bub");

  let buddy;
  try {
    buddy = EC.createCharacter(host, { spec: EC.RANA_SPEC || RANA.FALLBACK_SPEC, view: "full", interactive: true, bubble: true, sound: false, roam: 0 });
  } catch (e) { wrap.remove(); return; }
  // The bundle put its stylesheet in document.head; the shadow root needs its own copy.
  const bundleStyle = document.getElementById("exzi-character-style");
  if (bundleStyle) { const s = document.createElement("style"); s.textContent = bundleStyle.textContent; shadow.prepend(s); }
  const hold = (mood, ms = 4000) => buddy.setMood(mood, { hold: ms });
  const TIP_MOOD = {
    welcome: () => { hold("excited"); buddy.play("wave"); },
    streak: () => { hold("proud"); buddy.play("cheer"); },
    lesson: () => { hold("listening"); buddy.play("nod"); },
    homework: () => { hold("thinking"); buddy.play("think-tap"); },
    break: () => { hold("happy"); buddy.play("stretch"); },
    nudge: () => { hold("happy"); buddy.play("wave"); },
  };

  /* ── the dashboard's signals (§5) ── */
  let dock = document.documentElement.dataset.exziDock || null;   // "open" | "closed" | "fullscreen"
  let hiddenUntil = 0;
  let pendingTip = null;
  function dashboardBuddyOpen() { return onDashboard && (dock === "open" || dock === "fullscreen"); }
  function apply() {
    const show = !dashboardBuddyOpen() && Date.now() >= hiddenUntil;
    wrap.style.display = show ? "" : "none";
    if (show) { buddy.start(); if (pendingTip) showTip(pendingTip); }
    else { buddy.pause(); hideBubble(false); }
  }
  new MutationObserver(() => { dock = document.documentElement.dataset.exziDock || null; apply(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-exzi-dock"] });
  window.addEventListener("exz:exzi-state", (e) => {
    const b = e && e.detail && e.detail.buddy; // may be unreadable across worlds; the attribute above is the source of truth
    if (b === "open" || b === "fullscreen") dock = b;
    else if (b === "minimized" || b === "closed") dock = "closed";
    apply();
  });

  /* ── the bubble ── */
  let bubTimer = null;
  function hideBubble(clearPending = true) {
    clearTimeout(bubTimer);
    bub.style.display = "none";
    bub.textContent = "";
    if (clearPending) pendingTip = null;
  }
  function showTip(tip) {
    pendingTip = tip;
    if (wrap.style.display === "none") return; // shown as soon as the dashboard buddy is minimized again
    clearTimeout(bubTimer);
    bub.textContent = "";
    const who = document.createElement("span"); who.className = "who"; who.textContent = "from your dashboard"; bub.appendChild(who);
    bub.appendChild(document.createTextNode(String(tip.text)));
    const acts = document.createElement("div"); acts.className = "acts";
    const btn = (label, cls, fn) => { const b = document.createElement("button"); b.textContent = label; if (cls) b.className = cls; b.onclick = fn; acts.appendChild(b); };
    if (tip.action && tip.action.url && tip.action.label) btn(tip.action.label, "", () => { ask({ type: "open-url", url: tip.action.url }); verdict("ok"); });
    btn("Okay", "", () => verdict("ok"));
    btn("Later", "g", () => verdict("later"));
    btn("Not this", "g", () => verdict("never"));
    bub.appendChild(acts);
    bub.style.display = "block";
    (TIP_MOOD[tip.kind] || TIP_MOOD.nudge)();
    bubTimer = setTimeout(() => hideBubble(false), 120_000); // it stays "waiting" (badge) until answered
  }
  function verdict(v) {
    const tip = pendingTip;
    hideBubble();
    if (tip) ask({ type: "feedback", tipId: tip.id, verdict: v });
    if (v === "ok") { buddy.play("nod"); hold("happy", 1500); }
    else if (v === "never") hold("sad", 1500);
  }
  chrome.runtime.onMessage.addListener((m) => {
    if (!m || typeof m !== "object") return;
    if (m.type === "tip") { if (m.tip) showTip(m.tip); else hideBubble(); }
    else if (m.type === "hidden") { hiddenUntil = Number(m.until) || 0; apply(); }
  });

  /* ── toolbar ── */
  $("bSet").onclick = () => ask({ type: "open-options" });
  $("bHide").onclick = () => ask({ type: "hide-today" });

  /* ── drag to move: the overlay follows the pointer, so the character is simply carried along ── */
  let drag = null;
  host.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const r = wrap.getBoundingClientRect();
    drag = { sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, moved: false };
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 7) return;
    drag.moved = true;
    place(drag.x + dx, drag.y + dy);
  }, true);
  const endDrag = () => {
    if (drag && drag.moved) { const r = wrap.getBoundingClientRect(); try { chrome.storage.local.set({ pos: { x: r.left, y: r.top, w: window.innerWidth, h: window.innerHeight } }); } catch { /* no storage */ } }
    drag = null;
  };
  window.addEventListener("pointerup", endDrag, true);
  window.addEventListener("pointercancel", endDrag, true);
  function place(x, y) {
    const w = wrap.offsetWidth || 140, h = wrap.offsetHeight || 160;
    x = RANA.clamp(x, 0, Math.max(0, window.innerWidth - w));
    y = RANA.clamp(y, 0, Math.max(0, window.innerHeight - h));
    wrap.style.left = `${x}px`; wrap.style.top = `${y}px`; wrap.style.right = "auto"; wrap.style.bottom = "auto";
  }

  /* ── boot ── */
  (async () => {
    try {
      const { pos, hiddenUntil: hu } = await chrome.storage.local.get(["pos", "hiddenUntil"]);
      hiddenUntil = Number(hu) || 0;
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) place(pos.x, pos.y);
    } catch { /* first run */ }
    apply();
    const r = await ask({ type: "get-tip" });
    if (r && r.tip && !r.quietNow) showTip(r.tip);
  })();
})();
