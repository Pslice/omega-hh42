// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("API", {
  updatePort: (portName) => ipcRenderer.send(`updateTemperaturePort`, portName),
  onSerialData: (callback) =>
    ipcRenderer.on(`serialDataTemperature`, (event, data, unit) =>
      callback(data, unit),
    ),
  onSerialError: (callback) =>
    ipcRenderer.on(`serialErrorTemperature`, (event, error) => callback(error)),
  getPorts: () => ipcRenderer.invoke(`getTemperaturePorts`),
  recordTemperature: (temperatureValue, temperatureUnit) =>
    ipcRenderer.invoke("recordTemperature", temperatureValue, temperatureUnit),
  getTemperatures: (startDate, endDate) =>
    ipcRenderer.invoke("getTemperatures", startDate, endDate),
  resetDatabase: () => ipcRenderer.invoke("resetDatabase"),
  onSetCelsiusMode: (callback) =>
    ipcRenderer.on("setCelsiusMode", () => callback()),
  onSetFahrenheitMode: (callback) =>
    ipcRenderer.on("setFahrenheitMode", () => callback()),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateStatus: (callback) =>
    ipcRenderer.on("update-status", (event, status, data) =>
      callback(status, data),
    ),
});
