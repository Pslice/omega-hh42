const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("node:path");
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
