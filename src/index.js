const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("node:path");
const { autoUpdater } = require("electron-updater");
const OmegaHH42 = require("./device/hh42");
const createMenuTemplate = require("./menu");
const TemperatureDatabase = require("./database");

let hh42;
let mainWindow;
let temperatureDb;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 550,
    minWidth: 500,
    minHeight: 400,
    backgroundColor: "#0f172a", // matches bg-slate-900
    titleBarStyle: "hiddenInset", // gives a more native look on macOS
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  hh42 = new OmegaHH42(mainWindow);
  mainWindow.hh42 = hh42;
};

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendUpdateStatus("checking-for-update");
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdateStatus("update-available", info);
  });

  autoUpdater.on("update-not-available", () => {
    sendUpdateStatus("update-not-available");
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus("download-progress", progress);
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendUpdateStatus("update-downloaded", info);
  });

  autoUpdater.on("error", (error) => {
    sendUpdateStatus("update-error", error?.message || "Unknown error");
  });

  ipcMain.handle("check-for-updates", async () => {
    try {
      return await autoUpdater.checkForUpdates();
    } catch (error) {
      console.error("Error checking for updates:", error);
      return null;
    }
  });

  ipcMain.handle("download-update", async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error("Error downloading update:", error);
    }
  });

  ipcMain.handle("install-update", () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("Auto update check failed:", err);
    });
  }, 3000);
}

function sendUpdateStatus(status, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", status, data);
  }
}

app.whenReady().then(async () => {
  // Initialize the temperature database
  temperatureDb = new TemperatureDatabase();
  await temperatureDb.initialize();

  createWindow();

  // Create and set the application menu
  const menuTemplate = createMenuTemplate(mainWindow);
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  ipcMain.handle(`getTemperaturePorts`, async () => {
    return await OmegaHH42.getAvailablePorts();
  });
  setupIpcHandlersTemperature();
  setupIpcHandlersDatabase();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function setupIpcHandlersTemperature() {
  ipcMain.on("updateTemperaturePort", async (event, portName) => {
    try {
      await hh42.initializeSerialPort(portName);
      event.reply("updateTemperaturePort:success");
    } catch (error) {
      event.reply("updateTemperaturePort:error", {
        message: error.message || "Failed to initialize temperature port",
      });
    }
  });
}

function setupIpcHandlersDatabase() {
  ipcMain.handle(
    "recordTemperature",
    async (event, temperatureValue, temperatureUnit) => {
      try {
        return await temperatureDb.recordTemperature(
          temperatureValue,
          temperatureUnit,
        );
      } catch (error) {
        console.error("Error recording temperature:", error);
        throw error;
      }
    },
  );

  ipcMain.handle("getTemperatures", async (event, startDate, endDate) => {
    try {
      return await temperatureDb.getTemperatures(startDate, endDate);
    } catch (error) {
      console.error("Error getting temperatures:", error);
      throw error;
    }
  });

  ipcMain.handle("resetDatabase", async () => {
    try {
      await temperatureDb.clearAllTemperatures();
      return { success: true };
    } catch (error) {
      console.error("Error resetting database:", error);
      throw error;
    }
  });
}
