/**
 * Sign-in with Exzellent by the device-code flow (companion-api.md §4).
 *
 * Runs in the main process only: every fetch is here, the renderer sees the
 * status and the user code and never a token. Tokens go into the JSON store
 * through `secrets` (Electron safeStorage in main.js, identity in tests).
 *
 *   const account = createAccount({ store, deviceName: os.hostname() });
 *   const { userCode, verifyUrl } = await account.start();   // then poll runs by itself
 *   account.on((status) => …);                                // pending → connected / expired / denied
 *   const res = await account.fetch("/api/companion/guidance"); // Bearer, refresh on 401
 *   await account.disconnect();                               // DELETE /api/auth/device, tokens gone
 */

export const DEFAULT_BASE_URL = "https://exzellent-backend-1.onrender.com";

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/** Tokens as they are when nothing encrypts them (tests, or a desktop without a keychain — see sessionOnlyStore). */
export const PLAIN_SECRETS = { encrypt: (s) => s, decrypt: (s) => s };

/**
 * A store whose `account` key lives only in memory: for a desktop where the OS cannot
 * encrypt for us, so the tokens are never written plain to disk and the sign-in lasts
 * until the app quits. Every other key goes through to the real store.
 */
export function sessionOnlyStore(store) {
  let account = null;
  return {
    get: (k) => (k === "account" ? account : store.get(k)),
    set: (patch) => {
      const { account: a, ...rest } = patch || {};
      if (patch && "account" in patch) account = a == null ? null : a;
      if (Object.keys(rest).length) store.set(rest);
    },
  };
}

const json = async (res) => {
  try { return await res.json(); } catch { return {}; }
};

export function createAccount({
  store,
  baseUrl = null,
  fetch: fetchImpl = null,
  secrets = PLAIN_SECRETS,
  client = "rana-desktop",
  deviceName = "computer",
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  timeoutMs = 20_000,
  log = () => {},
} = {}) {
  const f = fetchImpl || globalThis.fetch;
  const listeners = new Set();
  let pending = null;   // { deviceCode, userCode, verifyUrl, interval, expiresAt, timer }
  let refreshing = null;

  const base = () => String(baseUrl || store.get("apiBase") || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const signal = () => (typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined);

  function emit(extra = {}) {
    const s = { ...status(), ...extra };
    for (const fn of listeners) {
      try { fn(s); } catch (e) { log("account listener failed", e && e.message); }
    }
  }

  // ── tokens in the store ──
  function readTokens() {
    const a = store.get("account");
    if (!a || !a.token) return null;
    try {
      return { token: secrets.decrypt(a.token), refreshToken: a.refreshToken ? secrets.decrypt(a.refreshToken) : null };
    } catch (e) {
      // Encrypted by another key (another user or machine, a reset keychain): it can never be used again,
      // so forget it rather than show "Connected as …" with a token no request can carry.
      log("stored tokens unreadable, forgetting them:", e && e.message);
      clearTokens();
      return null;
    }
  }
  function writeTokens(token, refreshToken, user) {
    const prev = store.get("account") || {};
    store.set({
      account: {
        user: user || prev.user || null,
        token: secrets.encrypt(String(token)),
        refreshToken: refreshToken ? secrets.encrypt(String(refreshToken)) : prev.refreshToken || null,
        connectedAt: prev.connectedAt || new Date().toISOString(),
      },
    });
  }
  function clearTokens() {
    store.set({ account: null });
  }

  function status() {
    // Connected means a token we can actually read and send, not merely a stored blob.
    const connected = readTokens() !== null;
    const a = connected ? store.get("account") : null;
    return {
      connected,
      user: connected ? a.user || null : null,
      connectedAt: connected ? a.connectedAt || null : null,
      pending: pending ? { userCode: pending.userCode, verifyUrl: pending.verifyUrl, expiresAt: pending.expiresAt, interval: pending.interval } : null,
      baseUrl: base(),
    };
  }

  async function post(path, body, token = null) {
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    return f(base() + path, { method: "POST", headers, body: JSON.stringify(body), signal: signal() });
  }

  // ── device flow ──
  async function start() {
    cancel();
    const res = await post("/api/auth/device/start", { client, name: String(deviceName || "computer").slice(0, 80) });
    const body = await json(res);
    if (!res.ok || !body.deviceCode || !body.userCode) throw new AuthError(body.message || `could not start sign-in (${res.status})`, res.status);
    const interval = Math.max(1, Number(body.interval) || 5);
    const expiresIn = Math.max(30, Number(body.expiresIn) || 600);
    pending = {
      deviceCode: body.deviceCode,
      userCode: body.userCode,
      verifyUrl: body.verifyUrl || "",
      interval,
      expiresAt: Date.now() + expiresIn * 1000,
      timer: null,
    };
    schedulePoll(interval * 1000);
    emit({ reason: "pending" });
    return { userCode: pending.userCode, verifyUrl: pending.verifyUrl, interval, expiresIn };
  }

  function schedulePoll(ms) {
    if (!pending) return;
    if (pending.timer) clearTimer(pending.timer);
    pending.timer = setTimer(() => { pending && (pending.timer = null); poll(); }, ms);
  }

  /** One poll of the pending code; runs on its own timer, callable for tests. */
  async function poll() {
    const p = pending;
    if (!p) return "idle";
    if (Date.now() >= p.expiresAt) {
      pending = null;
      emit({ reason: "expired" });
      return "expired";
    }
    let res, body;
    try {
      res = await post("/api/auth/device/poll", { deviceCode: p.deviceCode });
      body = await json(res);
    } catch (e) {
      log("device poll: network", e && e.message);
      if (pending === p) schedulePoll(p.interval * 1000);
      return "pending";
    }
    if (pending !== p) return "idle"; // cancelled or restarted meanwhile
    if (res.ok && body.status === "approved" && body.token) {
      pending = null;
      writeTokens(body.token, body.refreshToken, body.user || null);
      emit({ reason: "approved" });
      return "approved";
    }
    if (res.status === 410 || body.status === "expired") {
      pending = null;
      emit({ reason: "expired" });
      return "expired";
    }
    if (res.status === 403 || body.status === "denied") {
      pending = null;
      emit({ reason: "denied" });
      return "denied";
    }
    if (res.status === 429) p.interval += 5; // asked to slow down
    schedulePoll(p.interval * 1000);
    return "pending";
  }

  function cancel() {
    if (!pending) return;
    if (pending.timer) clearTimer(pending.timer);
    pending = null;
    emit({ reason: "cancelled" });
  }

  // ── authorised fetch with one refresh on 401 ──
  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const t = readTokens();
      if (!t || !t.refreshToken) {
        clearTokens();
        emit({ reason: "signed-out" });
        return false;
      }
      let res, body;
      try {
        res = await post("/api/auth/device/refresh", { refreshToken: t.refreshToken });
        body = await json(res);
      } catch (e) {
        log("refresh: network", e && e.message);
        return false; // keep the tokens, try again later
      }
      if (res.ok && body.token) {
        writeTokens(body.token, body.refreshToken || t.refreshToken);
        return true;
      }
      if ([400, 401, 403, 410].includes(res.status)) {
        clearTokens();
        emit({ reason: "signed-out" });
      }
      return false;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function authFetch(path, init = {}) {
    let t = readTokens();
    if (!t) throw new AuthError("not signed in", 401);
    const withAuth = (token) => ({ ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${token}` }, signal: init.signal || signal() });
    let res = await f(base() + path, withAuth(t.token));
    if (res.status !== 401) return res;
    const ok = await refresh();
    t = readTokens();
    if (!ok || !t) throw new AuthError(t ? "could not refresh the session" : "session ended", t ? 0 : 401);
    res = await f(base() + path, withAuth(t.token));
    return res;
  }

  async function disconnect() {
    cancel();
    const t = readTokens();
    if (t) {
      try {
        await f(base() + "/api/auth/device", { method: "DELETE", headers: { authorization: `Bearer ${t.token}` }, signal: signal() });
      } catch (e) {
        log("revoke: network", e && e.message);
      }
    }
    clearTokens();
    emit({ reason: "disconnected" });
  }

  return {
    status,
    start,
    poll,
    cancel,
    refresh,
    fetch: authFetch,
    disconnect,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get baseUrl() { return base(); },
  };
}
