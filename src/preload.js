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
});
