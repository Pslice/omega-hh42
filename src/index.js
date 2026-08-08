const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const HH42 = require("./device/hh42");
const createMenuTemplate = require("./menu");
const TemperatureDatabase = require("./database");

const isMac = process.platform === "darwin";

let mainWindow = null;
let hh42 = null;
let temperatureDb = null;
let currentUnit = "C";

// Windows launches a second process for shell integration (jump lists, file
// association); without this the second process would open a duplicate window
// and fight over the serial port.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  main();
}

function main() {
  app.whenReady().then(start).catch(handleFatal);

  app.on("window-all-closed", () => {
    if (!isMac) app.quit();
  });

  app.on("before-quit", async (event) => {
    if (!hh42 && !temperatureDb) return;
    event.preventDefault();
    await shutdown();
    app.quit();
  });
}

async function start() {
  temperatureDb = new TemperatureDatabase(
    // Must live outside the app bundle: on Windows a packaged app's resources
    // are inside a read-only app.asar archive, so the previous
    // path.join(__dirname, "temperatures.db") could never be written to.
    path.join(app.getPath("userData"), "temperatures.db"),
  );
  await temperatureDb.initialize();

  hh42 = new HH42();
  registerDeviceEvents();
  registerIpcHandlers();

  createWindow();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      createMenuTemplate({
        onSetUnit: setUnit,
        getUnit: () => currentUnit,
        onOpenDataFolder: () => shell.openPath(app.getPath("userData")),
      }),
    ),
  );

  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: "#0f172a",
    icon: resolveIcon(),
    // "hiddenInset" is a macOS-only style. Applying it on Windows hid the
    // caption bar without providing replacement controls, leaving the window
    // with no minimise/maximise/close buttons.
    ...(isMac ? { titleBarStyle: "hiddenInset" } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  if (!app.isPackaged) {
    // Renderer console output otherwise only exists inside DevTools, which
    // makes `npm start` diagnostics needlessly awkward.
    mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
      const tag = ["debug", "info", "warn", "error"][level] || "log";
      console.log(`[renderer:${tag}] ${message} (${sourceId}:${line})`);
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Keep navigation and popups inside the app; anything external goes to the
  // system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

function resolveIcon() {
  if (isMac) return undefined; // taken from the bundle
  return path.join(__dirname, process.platform === "win32" ? "icon.ico" : "icon.png");
}

function send(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function registerDeviceEvents() {
  hh42.on("reading", (reading) => {
    currentUnit = reading.unit;
    send("device:reading", reading);
  });

  hh42.on("outOfRange", (info) => send("device:out-of-range", info));

  hh42.on("status", (status) => {
    if (status.unit) currentUnit = status.unit;
    send("device:status", status);
  });
}

async function setUnit(unit) {
  currentUnit = unit === "F" ? "F" : "C";
  // Tell the renderer first so simulation mode responds even with no hardware
  // attached, then push the scale change to the meter if one is connected.
  send("device:unit", currentUnit);
  try {
    if (currentUnit === "F") await hh42.setFahrenheit();
    else await hh42.setCelsius();
  } catch (error) {
    send("device:status", { state: "error", message: error.message });
  }
}

function registerIpcHandlers() {
  ipcMain.handle("device:list-ports", () => HH42.listPorts());

  // Previously an ipcMain.on/event.reply pair that the renderer never listened
  // to, so port-open failures were invisible. invoke/handle surfaces the
  // rejection to the caller.
  ipcMain.handle("device:connect", async (event, portName) => {
    if (typeof portName !== "string" || !portName) {
      throw new Error("A port name is required");
    }
    await hh42.connect(portName);
    return { port: portName, unit: currentUnit };
  });

  ipcMain.handle("device:disconnect", async () => {
    await hh42.disconnect();
    return { ok: true };
  });

  ipcMain.handle("device:set-unit", (event, unit) => setUnit(unit));

  ipcMain.handle("db:record", (event, value, unit, timestamp) =>
    temperatureDb.recordTemperature(value, unit, timestamp),
  );

  ipcMain.handle("db:list", (event, options) =>
    temperatureDb.getTemperatures(options || {}),
  );

  ipcMain.handle("db:count", () => temperatureDb.countTemperatures());

  ipcMain.handle("db:clear", async () => {
    await temperatureDb.clearAllTemperatures();
    return { ok: true };
  });

  // Export runs in the main process so the whole table can be streamed to a
  // user-chosen file, instead of the renderer holding every row in memory and
  // dropping a blob into the Downloads folder unprompted.
  ipcMain.handle("db:export-csv", async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Export temperature log",
      defaultPath: path.join(
        app.getPath("documents"),
        `temperatures-${new Date().toISOString().slice(0, 10)}.csv`,
      ),
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (canceled || !filePath) return { canceled: true };

    const rows = await temperatureDb.getTemperatures({ limit: 100000 });
    const lines = ["id,temperature_value,temperature_unit,timestamp_utc"];
    for (const row of rows) {
      lines.push(
        [row.id, row.value, row.unit, row.timestamp].map(csvCell).join(","),
      );
    }
    await fs.writeFile(filePath, `${lines.join("\r\n")}\r\n`, "utf8");
    return { canceled: false, filePath, count: rows.length };
  });
}

/**
 * Quote anything that would otherwise break the row, and prefix formula
 * characters so a spreadsheet does not evaluate a stored value.
 */
function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function setupAutoUpdater() {
  // electron-updater throws in development (no app-update.yml is generated for
  // an unpackaged app), which used to produce a scary console error on
  // every `npm start`.
  if (!app.isPackaged) return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const forward = (status) => (data) => send("update:status", status, data);
  autoUpdater.on("checking-for-update", forward("checking"));
  autoUpdater.on("update-available", forward("available"));
  autoUpdater.on("update-not-available", forward("not-available"));
  autoUpdater.on("download-progress", forward("progress"));
  autoUpdater.on("update-downloaded", forward("downloaded"));
  autoUpdater.on("error", (error) =>
    send("update:status", "error", error?.message || "Unknown error"),
  );

  ipcMain.handle("update:check", () => autoUpdater.checkForUpdates());
  ipcMain.handle("update:download", () => autoUpdater.downloadUpdate());
  ipcMain.handle("update:install", () => autoUpdater.quitAndInstall(false, true));

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("Auto update check failed:", err.message);
    });
  }, 3000);
}

/**
 * Close the serial port and flush the database before the process exits.
 * Neither was previously released, so on Windows the COM port stayed claimed
 * until the process was killed and the WAL was left unchecked.
 */
async function shutdown() {
  const device = hh42;
  const db = temperatureDb;
  hh42 = null;
  temperatureDb = null;

  try {
    if (device) await device.disconnect();
  } catch (error) {
    console.error("Error closing serial port:", error.message);
  }
  try {
    if (db) await db.close();
  } catch (error) {
    console.error("Error closing database:", error.message);
  }
}

function handleFatal(error) {
  console.error("Startup failed:", error);
  dialog.showErrorBox(
    "OmegaHH42 could not start",
    `${error.message}\n\nIf this persists, delete the data folder at:\n${app.getPath("userData")}`,
  );
  app.exit(1);
}
