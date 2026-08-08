// Bridge between the sandboxed renderer and the main process.
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
const { contextBridge, ipcRenderer } = require("electron");

/**
 * Wrap ipcRenderer.on so every subscription hands back an unsubscribe
 * function. The renderer previously re-registered its serial-data listener
 * each time the port selection changed, so a reading was handled once per
 * change and the chart accumulated duplicate points.
 */
function subscribe(channel, callback) {
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("API", {
  // Used to apply the macOS-only custom title bar styling.
  platform: process.platform,

  device: {
    listPorts: () => ipcRenderer.invoke("device:list-ports"),
    connect: (portName) => ipcRenderer.invoke("device:connect", portName),
    disconnect: () => ipcRenderer.invoke("device:disconnect"),
    setUnit: (unit) => ipcRenderer.invoke("device:set-unit", unit),
    onReading: (cb) => subscribe("device:reading", cb),
    onOutOfRange: (cb) => subscribe("device:out-of-range", cb),
    onStatus: (cb) => subscribe("device:status", cb),
    onUnitChange: (cb) => subscribe("device:unit", cb),
  },

  db: {
    record: (value, unit, timestamp) =>
      ipcRenderer.invoke("db:record", value, unit, timestamp),
    list: (options) => ipcRenderer.invoke("db:list", options),
    count: () => ipcRenderer.invoke("db:count"),
    clear: () => ipcRenderer.invoke("db:clear"),
    exportCsv: () => ipcRenderer.invoke("db:export-csv"),
  },

  updates: {
    check: () => ipcRenderer.invoke("update:check"),
    download: () => ipcRenderer.invoke("update:download"),
    install: () => ipcRenderer.invoke("update:install"),
    onStatus: (cb) => subscribe("update:status", cb),
  },
});
