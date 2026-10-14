// The bridge between Rana's windows and the main process. The renderer never
// touches Node: everything goes through these named "rana:" channels, and the
// account's tokens never cross (the renderer only sees status and the code).
const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (cb) => {
  const handler = (_e, value) => cb(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("rana", {
  // main → renderer
  onState: on("rana:state"),
  onPrompt: on("rana:prompt"),
  onTip: on("rana:tip"),
  onPaused: on("rana:paused"),
  onSettings: on("rana:settings"),
  onAccount: on("rana:account"),
  // renderer → main
  ready: () => ipcRenderer.send("rana:ready"),
  reportError: (message) => ipcRenderer.send("rana:error", String(message)),
  setIgnore: (flag) => ipcRenderer.send("rana:set-ignore", !!flag),
  openSettings: () => ipcRenderer.send("rana:open-settings"),
  togglePause: () => ipcRenderer.send("rana:toggle-pause"),
  hide: () => ipcRenderer.send("rana:hide"),
  quit: () => ipcRenderer.send("rana:quit"),
  getSettings: () => ipcRenderer.invoke("rana:get-settings"),
  saveSettings: (patch) => ipcRenderer.send("rana:save-settings", patch),
  dragStart: () => ipcRenderer.invoke("rana:drag-start"),
  dragMove: (x, y) => ipcRenderer.send("rana:drag-move", { x: Number(x), y: Number(y) }),
  tipFeedback: (tipId, verdict) => ipcRenderer.send("rana:tip-feedback", { tipId: tipId || null, verdict: String(verdict) }),
  openExternal: (url) => ipcRenderer.send("rana:open-external", String(url)),
  openDashboard: () => ipcRenderer.send("rana:open-dashboard"),
  setAutostart: (flag) => ipcRenderer.send("rana:set-autostart", !!flag),
  account: {
    status: () => ipcRenderer.invoke("rana:account-status"),
    start: () => ipcRenderer.invoke("rana:account-start"),
    cancel: () => ipcRenderer.send("rana:account-cancel"),
    disconnect: () => ipcRenderer.invoke("rana:account-disconnect"),
  },
});
