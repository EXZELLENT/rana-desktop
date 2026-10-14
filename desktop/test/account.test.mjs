import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createAccount, sessionOnlyStore, PLAIN_SECRETS, AuthError } from "../src/account.js";

/* A memory store with the Store's get/set shape, and tokens "encrypted" so the test can see they never sit plain. */
class MemStore { constructor() { this.data = {}; } get(k) { return this.data[k]; } set(p) { Object.assign(this.data, p); } }
const secrets = {
  encrypt: (s) => "enc:" + Buffer.from(s).toString("base64"),
  decrypt: (s) => { if (!s.startsWith("enc:")) throw new Error("not encrypted"); return Buffer.from(s.slice(4), "base64").toString(); },
};

/* The contract's device routes (companion-api.md §4) and one guarded route, in-process. */
function backend() {
  const state = { approved: false, denied: false, expired: false, token: "t1", refreshToken: "r1", refreshOk: true, calls: [] };
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      state.calls.push({ method: req.method, url: req.url, body, auth: req.headers.authorization || null });
      const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(obj === undefined ? "" : JSON.stringify(obj)); };
      if (req.url === "/api/auth/device/start") {
        if (body.client !== "rana-desktop" || !body.name) return send(400, { message: "client and name required" });
        return send(200, { deviceCode: "dc-1", userCode: "KX7M-3RQB", verifyUrl: "https://www.exzellent.co/student-dashboard/rana?code=KX7M-3RQB", interval: 5, expiresIn: 600 });
      }
      if (req.url === "/api/auth/device/poll") {
        if (body.deviceCode !== "dc-1") return send(404, { message: "unknown device code" });
        if (state.expired) return send(410, { status: "expired" });
        if (state.denied) return send(403, { status: "denied" });
        if (!state.approved) return send(200, { status: "pending" });
        return send(200, { status: "approved", token: state.token, refreshToken: state.refreshToken, user: { _id: "u1", name: "Rio Weber", firstName: "Rio", userType: "student", targetLanguage: "de", proficiencyLevel: "B1" } });
      }
      if (req.url === "/api/auth/device/refresh") {
        if (!state.refreshOk || body.refreshToken !== state.refreshToken) return send(401, { message: "refresh token unknown" });
        state.token += "x"; state.refreshToken += "x";
        return send(200, { token: state.token, refreshToken: state.refreshToken });
      }
      if (req.url === "/api/auth/device" && req.method === "DELETE") return req.headers.authorization === `Bearer ${state.token}` ? send(204) : send(401, { message: "no" });
      if (req.url.startsWith("/api/companion/guidance")) {
        if (req.headers.authorization !== `Bearer ${state.token}`) return send(401, { message: "token expired" });
        return send(200, { state: { buddy: "minimized", page: "/student-dashboard", at: "2026-10-14T09:00:00.000Z" }, tip: { id: "tip-1", text: "Your streak is 4 days. One lesson keeps it.", kind: "streak" }, next: 120 });
      }
      send(404, { message: "no route " + req.url });
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ state, server, url: `http://127.0.0.1:${server.address().port}` })));
}

const timers = [];
const manual = { setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {} };
const make = (url, store = new MemStore()) => ({ store, account: createAccount({ store, baseUrl: url, secrets, deviceName: "test-machine", ...manual }) });

let be;
test.before(async () => { be = await backend(); });
after(() => be.server.close());

test("device flow: start gives the code, polls stay pending, approval stores encrypted tokens and the user", async () => {
  be.state.approved = false;
  const { store, account } = make(be.url);
  const started = await account.start();
  assert.equal(started.userCode, "KX7M-3RQB");
  assert.match(started.verifyUrl, /^https:\/\/www\.exzellent\.co\/student-dashboard\/rana\?code=/);
  assert.equal(started.interval, 5);
  assert.deepEqual(be.state.calls.at(-1).body, { client: "rana-desktop", name: "test-machine" });
  let s = account.status();
  assert.equal(s.connected, false);
  assert.equal(s.pending.userCode, "KX7M-3RQB");
  assert.equal(timers.at(-1).ms, 5000, "polls every `interval` seconds");

  assert.equal(await account.poll(), "pending");
  assert.equal(account.status().pending.userCode, "KX7M-3RQB");

  be.state.approved = true;
  const seen = [];
  account.on((st) => seen.push(st.reason));
  assert.equal(await account.poll(), "approved");
  s = account.status();
  assert.equal(s.connected, true);
  assert.equal(s.pending, null);
  assert.equal(s.user.name, "Rio Weber");
  assert.ok(seen.includes("approved"));
  assert.ok(store.data.account.token.startsWith("enc:"), "access token never sits plain in the store");
  assert.ok(store.data.account.refreshToken.startsWith("enc:"), "refresh token never sits plain in the store");
  assert.equal(secrets.decrypt(store.data.account.token), "t1");
});

test("fetch: Bearer header, a 401 refreshes (rotating both tokens) and retries once", async () => {
  be.state.approved = true; be.state.token = "t1"; be.state.refreshToken = "r1"; be.state.refreshOk = true;
  const { store, account } = make(be.url);
  await account.start();
  await account.poll();
  let res = await account.fetch("/api/companion/guidance");
  assert.equal(res.status, 200);
  assert.equal(be.state.calls.at(-1).auth, "Bearer t1");

  be.state.token = "t2"; // the backend no longer takes t1
  be.state.calls.length = 0;
  res = await account.fetch("/api/companion/guidance?since=2026-10-14T09:00:00.000Z");
  assert.equal(res.status, 200);
  const urls = be.state.calls.map((c) => c.url);
  assert.deepEqual(urls, ["/api/companion/guidance?since=2026-10-14T09:00:00.000Z", "/api/auth/device/refresh", "/api/companion/guidance?since=2026-10-14T09:00:00.000Z"]);
  assert.equal(be.state.calls[1].body.refreshToken, "r1");
  assert.equal(be.state.calls[2].auth, "Bearer t2x");
  assert.equal(secrets.decrypt(store.data.account.refreshToken), "r1x", "rotated refresh token stored");
  assert.equal(account.status().connected, true);
});

test("fetch: a refused refresh signs the device out and throws AuthError", async () => {
  be.state.approved = true; be.state.token = "t1"; be.state.refreshToken = "r1"; be.state.refreshOk = true;
  const { account } = make(be.url);
  await account.start();
  await account.poll();
  be.state.token = "gone"; be.state.refreshOk = false;
  const seen = [];
  account.on((st) => seen.push(st.reason));
  await assert.rejects(() => account.fetch("/api/companion/guidance"), (e) => e instanceof AuthError && e.status === 401);
  assert.equal(account.status().connected, false);
  assert.ok(seen.includes("signed-out"));
  await assert.rejects(() => account.fetch("/api/companion/guidance"), /not signed in/);
});

test("disconnect revokes the device with the Bearer token and forgets it locally", async () => {
  be.state.approved = true; be.state.token = "t1"; be.state.refreshToken = "r1"; be.state.refreshOk = true;
  const { store, account } = make(be.url);
  await account.start();
  await account.poll();
  be.state.calls.length = 0;
  await account.disconnect();
  assert.deepEqual(be.state.calls.map((c) => [c.method, c.url, c.auth]), [["DELETE", "/api/auth/device", "Bearer t1"]]);
  assert.equal(account.status().connected, false);
  assert.equal(store.data.account, null);
});

test("expired and denied codes end the pending sign-in with a reason", async () => {
  be.state.approved = false;
  const { account } = make(be.url);
  const seen = [];
  account.on((st) => seen.push(st.reason));
  await account.start();
  be.state.expired = true;
  assert.equal(await account.poll(), "expired");
  assert.equal(account.status().pending, null);
  be.state.expired = false; be.state.denied = true;
  await account.start();
  assert.equal(await account.poll(), "denied");
  be.state.denied = false;
  assert.deepEqual(seen.filter((r) => r !== "pending"), ["expired", "denied"]);
  assert.equal(await account.poll(), "idle");
});

test("cancel stops a pending sign-in; a start with the wrong client is refused", async () => {
  const { account } = make(be.url);
  await account.start();
  account.cancel();
  assert.equal(account.status().pending, null);
  const bad = createAccount({ store: new MemStore(), baseUrl: be.url, secrets, client: "rana-fridge", deviceName: "x", ...manual });
  await assert.rejects(() => bad.start(), (e) => e instanceof AuthError && e.status === 400);
});

test("a stored token that cannot be decrypted shows as signed out and is forgotten, not as a connected account that cannot fetch", async () => {
  const store = new MemStore();
  store.data.account = { user: { name: "Rio Weber" }, token: "written-by-another-key", refreshToken: "also-unreadable", connectedAt: "2026-10-01T00:00:00.000Z" };
  const logs = [];
  const account = createAccount({ store, baseUrl: be.url, secrets, deviceName: "x", log: (...a) => logs.push(a.join(" ")), ...manual });
  const s = account.status();
  assert.equal(s.connected, false);
  assert.equal(s.user, null);
  assert.equal(store.data.account, null, "the unreadable blob is cleared");
  assert.ok(logs.some((l) => /unreadable/.test(l)));
  await assert.rejects(() => account.fetch("/api/companion/guidance"), /not signed in/);
  // A fresh sign-in overwrites it as usual.
  be.state.approved = true; be.state.token = "t1"; be.state.refreshToken = "r1";
  await account.start();
  assert.equal(await account.poll(), "approved");
  assert.equal(account.status().connected, true);
});

test("sessionOnlyStore keeps the account in memory only and passes every other key through", async () => {
  const disk = new MemStore();
  disk.data.apiBase = be.url;
  const mem = sessionOnlyStore(disk);
  const account = createAccount({ store: mem, secrets: PLAIN_SECRETS, deviceName: "x", ...manual });
  assert.equal(account.baseUrl, be.url, "apiBase is read through from the real store");
  be.state.approved = true; be.state.token = "t1"; be.state.refreshToken = "r1";
  await account.start();
  assert.equal(await account.poll(), "approved");
  assert.equal(account.status().connected, true);
  assert.equal(account.status().user.name, "Rio Weber");
  assert.equal(disk.data.account, undefined, "no token, plain or otherwise, reaches the file");
  mem.set({ apiBase: "https://example.test", account: mem.get("account") });
  assert.equal(disk.data.apiBase, "https://example.test");
  assert.equal(disk.data.account, undefined);
  await account.disconnect();
  assert.equal(account.status().connected, false);
  assert.equal(mem.get("account"), null);
});
