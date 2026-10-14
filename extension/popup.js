/* Rana extension — the action popup: status and the latest tip. */
const $ = (id) => document.getElementById(id);
const ask = (message) => new Promise((resolve) => {
  chrome.runtime.sendMessage(message, (r) => { void chrome.runtime.lastError; resolve(r && r.ok ? r.result : null); });
});

function render(st) {
  if (!st) { $("st").innerHTML = '<span class="warn">Rana is not awake — reload the extension</span>'; return; }
  const who = st.user && (st.user.firstName || st.user.name);
  $("st").innerHTML = st.connected
    ? `<span class="ok">● connected</span> as ${escapeHtml(who || "you")}${st.quietNow ? " · quiet hours" : ""}`
    : st.pending ? '<span class="warn">● waiting for approval</span> — open Settings' : '<span class="warn">○ not connected</span> — open Settings to connect';
  const tip = st.tip;
  $("tip").hidden = !tip;
  $("noTip").hidden = !!tip;
  if (tip) {
    $("tipText").textContent = tip.text;
    const acts = $("tipActs");
    acts.textContent = "";
    const btn = (label, cls, fn) => { const b = document.createElement("button"); b.textContent = label; if (cls) b.className = cls; b.onclick = fn; acts.appendChild(b); };
    if (tip.action && tip.action.url && tip.action.label) btn(tip.action.label, "", () => { ask({ type: "open-url", url: tip.action.url }); verdict(tip, "ok"); });
    btn("Okay", "", () => verdict(tip, "ok"));
    btn("Later", "g", () => verdict(tip, "later"));
    btn("Not this", "g", () => verdict(tip, "never"));
  }
  const p = st.poll || {};
  $("meta").textContent = p.lastPolledAt
    ? `last asked ${new Date(p.lastPolledAt).toLocaleTimeString()}${p.lastError ? ` · ${p.lastError}` : ""}${st.settings && st.settings.everywhere ? " · everywhere on" : ""}`
    : "";
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
async function verdict(tip, v) { await ask({ type: "feedback", tipId: tip.id, verdict: v }); render(await ask({ type: "get-status" })); }

$("dash").onclick = () => { chrome.tabs.create({ url: RANA.DASHBOARD_URL }); window.close(); };
$("opts").onclick = () => { chrome.runtime.openOptionsPage(); window.close(); };
$("now").onclick = async () => { $("now").disabled = true; await ask({ type: "poll-now" }); render(await ask({ type: "get-status" })); $("now").disabled = false; };
chrome.runtime.onMessage.addListener((m) => { if (m && m.type === "status" && m.status) render(m.status); if (m && m.type === "tip") ask({ type: "get-status" }).then(render); });
ask({ type: "get-status" }).then(render);
