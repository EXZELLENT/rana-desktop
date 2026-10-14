/* Rana extension — the options page: sign-in by device code (the worker does the
 * fetches; this page only ticks the poll while it is open), "everywhere" opt-in,
 * quiet hours, tips on/off, the server. Every change is saved at once. */
const $ = (id) => document.getElementById(id);
const ask = (message) => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage(message, (r) => {
    if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
    if (!r || !r.ok) return reject(new Error((r && r.error) || "no answer"));
    resolve(r.result);
  });
});
let pollTimer = null, expiryTimer = null;

function renderAccount(st, reason) {
  $("aNone").hidden = !!(st.connected || st.pending);
  $("aPending").hidden = !st.pending;
  $("aDone").hidden = !st.connected;
  clearInterval(expiryTimer); clearInterval(pollTimer);
  if (st.pending) {
    $("aCode").textContent = st.pending.userCode;
    $("aOpen").dataset.url = st.pending.verifyUrl || "";
    const tick = () => {
      const left = Math.max(0, Math.round((st.pending.expiresAt - Date.now()) / 1000));
      $("aLeft").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    };
    tick(); expiryTimer = setInterval(tick, 1000);
    pollTimer = setInterval(() => ask({ type: "account-poll" }).catch(() => {}), Math.max(1, st.pending.interval || 5) * 1000);
  }
  if (st.connected) $("aName").textContent = (st.user && (st.user.name || st.user.firstName)) || "you";
  const msg = { expired: "The code expired — connect again for a new one.", denied: "That code was refused on the dashboard.", "signed-out": "Exzellent ended this session — connect again.", approved: "Connected. Tips will arrive in Rana's bubble.", disconnected: "Disconnected; this browser is forgotten on the dashboard too." }[reason];
  if (msg) { $("aMsg").textContent = msg; $("aMsg").className = "note " + (reason === "approved" ? "ok" : "warn"); }
  else if (reason === "pending" || reason === "cancelled") { $("aMsg").textContent = ""; $("aMsg").className = "note"; }
}
function renderSettings(s) {
  $("tTips").checked = s.tips !== false;
  $("apiBase").value = s.apiBase || "";
  $("tEverywhere").checked = !!s.everywhere;
  const q = s.quiet || RANA.DEFAULT_QUIET;
  const on = !(q.from === 0 && q.to === 0);
  $("qOn").checked = on;
  $("qFrom").value = RANA.toClock(on ? q.from : RANA.DEFAULT_QUIET.from);
  $("qTo").value = RANA.toClock(on ? q.to : RANA.DEFAULT_QUIET.to);
}
function render(st, reason) { renderAccount(st, reason); renderSettings(st.settings || {}); }

async function save(patch) {
  try {
    const s = await ask({ type: "save-settings", settings: patch });
    renderSettings(s);
    $("status").textContent = "Saved."; $("status").className = "note ok";
    setTimeout(() => { $("status").textContent = ""; }, 1500);
  } catch (e) { $("status").textContent = e.message; $("status").className = "note warn"; }
}
const quietPatch = () => ({ quiet: $("qOn").checked ? { from: RANA.fromClock($("qFrom").value, RANA.DEFAULT_QUIET.from), to: RANA.fromClock($("qTo").value, RANA.DEFAULT_QUIET.to) } : { from: 0, to: 0 } });

$("aConnect").onclick = async () => {
  $("aConnect").disabled = true; $("aMsg").textContent = "Asking Exzellent for a code…"; $("aMsg").className = "note";
  try { await ask({ type: "account-start" }); }
  catch (e) { $("aMsg").textContent = e.message || "Could not reach Exzellent."; $("aMsg").className = "note warn"; }
  $("aConnect").disabled = false;
};
$("aOpen").onclick = () => { if ($("aOpen").dataset.url) ask({ type: "open-url", url: $("aOpen").dataset.url }).catch(() => {}); };
$("aCancel").onclick = () => ask({ type: "account-cancel" }).catch(() => {});
$("aDisc").onclick = async () => { $("aDisc").disabled = true; try { await ask({ type: "account-disconnect" }); } catch { /* status arrives anyway */ } $("aDisc").disabled = false; };
$("tTips").onchange = () => save({ tips: $("tTips").checked });
$("apiBase").onchange = () => save({ apiBase: $("apiBase").value.trim() });
$("qOn").onchange = $("qFrom").onchange = $("qTo").onchange = () => save(quietPatch());
$("tEverywhere").onchange = async () => {
  const on = $("tEverywhere").checked;
  $("eMsg").textContent = ""; $("eMsg").className = "note";
  if (on) {
    let granted = false;
    try { granted = await chrome.permissions.request({ origins: ["<all_urls>"] }); } catch (e) { $("eMsg").textContent = e.message; }
    if (!granted) { $("tEverywhere").checked = false; $("eMsg").textContent = "Not allowed — Rana stays on exzellent.co."; $("eMsg").className = "note warn"; return; }
    await save({ everywhere: true });
    $("eMsg").textContent = "Rana will appear on sites you open from now on (reload a page to see her there)."; $("eMsg").className = "note ok";
  } else {
    await save({ everywhere: false });
    try { await chrome.permissions.remove({ origins: ["<all_urls>"] }); } catch { /* Chrome may keep it; the script is unregistered either way */ }
    $("eMsg").textContent = "Rana stays on exzellent.co only.";
  }
};

chrome.runtime.onMessage.addListener((m) => { if (m && m.type === "status" && m.status) render(m.status, m.reason); });
ask({ type: "get-status" }).then((st) => render(st)).catch((e) => { $("status").textContent = e.message; $("status").className = "note warn"; });
