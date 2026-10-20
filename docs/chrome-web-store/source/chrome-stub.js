/* A stand-in for the chrome.* APIs the extension's pages call, so popup.html,
 * options.html and content.js run unchanged in an ordinary page for the store
 * images. make-images.mjs injects it into every frame before any script runs
 * (Page.addScriptToEvaluateOnNewDocument), with `RANA_SHOT` set to the state to
 * show ("connected" or "pending"). Nothing here talks to a network. */
(() => {
  const state = (typeof RANA_SHOT === "string" && RANA_SHOT) || "connected";
  const now = Date.now();
  const TIP = {
    id: "store-shot",
    kind: "lesson",
    text: "Your lesson with Lena starts in 15 minutes.",
    action: { label: "Open the lesson", url: "https://www.exzellent.co/student-dashboard" },
    at: now,
  };
  const SETTINGS = { everywhere: false, tips: true, quiet: { from: 23.75, to: 7 }, apiBase: "https://exzellent-backend-1.onrender.com" };
  const STATUS = state === "pending"
    ? {
        connected: false, user: null, tip: null,
        pending: { userCode: "KX7M-3RQB", verifyUrl: "https://www.exzellent.co/student-dashboard/rana?code=KX7M-3RQB", expiresAt: now + 552_000, interval: 5 },
        poll: { failures: 0, lastPolledAt: null, lastError: null }, settings: SETTINGS, quietNow: false,
      }
    : {
        connected: true, user: { name: "Alex Morgan", firstName: "Alex" }, pending: null, tip: TIP,
        poll: { failures: 0, lastPolledAt: now - 64_000, lastError: null }, settings: SETTINGS, quietNow: false,
      };
  const answers = {
    "get-status": () => STATUS,
    "get-tip": () => ({ tip: STATUS.tip, quietNow: false }),
    "account-poll": () => "pending",
  };
  const reply = (message) => ({ ok: true, result: answers[message && message.type] ? answers[message.type]() : null });
  const stub = {
    runtime: {
      lastError: undefined,
      sendMessage(message, cb) {
        const r = reply(message);
        if (typeof cb === "function") { setTimeout(() => cb(r), 0); return undefined; }
        return Promise.resolve(r);
      },
      onMessage: { addListener() {} },
      openOptionsPage() { return Promise.resolve(); },
    },
    storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } },
    tabs: { create: () => Promise.resolve({}) },
    permissions: { request: () => Promise.resolve(false), remove: () => Promise.resolve(true), contains: () => Promise.resolve(false) },
  };
  Object.defineProperty(window, "chrome", { value: stub, configurable: true, writable: true });
})();
