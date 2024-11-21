const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const OmegaHH42 = require('./device/hh42');

let hh42;
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  hh42 = new OmegaHH42(mainWindow);

};


app.whenReady().then(() => {
  createWindow();
  ipcMain.handle(`getTemperaturePorts`, async () => {
    return await OmegaHH42.getAvailablePorts();
  });
  setupIpcHandlersTemperature();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function setupIpcHandlersTemperature() {
  ipcMain.on('updateTemperaturePort', (event, portName) => {
    hh42.initializeSerialPort(portName);
  });

  ipcMain.on('setFahrenheitMode', () => {
    if (hh42) {
      hh42.setFahrenheitMode();
    }
  });

  ipcMain.on('setCelsiusMode', () => {
    if (hh42) {
      hh42.setCelsiusMode();
    }
  });
}
