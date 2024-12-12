const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('node:path');
const OmegaHH42 = require('./device/hh42');
const createMenuTemplate = require('./menu');
const sqlite3 = require('sqlite3').verbose();

// Initialize database
const db = new sqlite3.Database(path.join(__dirname, 'temperatures.db'));
db.run(`
  CREATE TABLE IF NOT EXISTS temperatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      temperature REAL NOT NULL,
      timestamp TEXT NOT NULL
  )
`);
let hh42;
let mainWindow;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1e293b', // matches bg-slate-800
    titleBarStyle: 'hiddenInset', // gives a more native look on macOS
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  hh42 = new OmegaHH42(mainWindow);
};


app.whenReady().then(() => {
  createWindow();

  // Create and set the application menu
  const menuTemplate = createMenuTemplate(mainWindow);
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

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
  ipcMain.on('updateTemperaturePort', async (event, portName) => {
    try {
      await hh42.initializeSerialPort(portName);
      event.reply('updateTemperaturePort:success');
    } catch (error) {
      event.reply('updateTemperaturePort:error', {
        message: error.message || 'Failed to initialize temperature port'
      });
    }
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
ipcMain.handle('save-temperature', async (event, data) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO temperatures (temperature, timestamp) VALUES (?, ?)',
      [data.temperature, data.timestamp],
      function (err) {
        if (err) reject(err);
        resolve(this.lastID);
      }
    );
  });
});

ipcMain.handle('getTemperatures', async () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM temperatures', (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
});