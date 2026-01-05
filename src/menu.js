const { app } = require("electron");
const isMac = process.platform === "darwin";

const createMenuTemplate = (mainWindow) => {
  return [
    // App Menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),

    // File Menu
    {
      label: "File",
      submenu: [
        {
          label: "Temperature Units",
          submenu: [
            {
              label: "Celsius",
              click: () => {
                // Send to renderer for simulation mode
                mainWindow.webContents.send("setCelsiusMode");
                // Send to device for real hardware mode
                if (mainWindow.hh42) {
                  mainWindow.hh42.setCelsiusMode();
                }
              },
            },
            {
              label: "Fahrenheit",
              click: () => {
                // Send to renderer for simulation mode
                mainWindow.webContents.send("setFahrenheitMode");
                // Send to device for real hardware mode
                if (mainWindow.hh42) {
                  mainWindow.hh42.setFahrenheitMode();
                }
              },
            },
          ],
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },

    // View Menu
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
      ],
    },

    // Window Menu
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" },
              { role: "front" },
              { type: "separator" },
              { role: "window" },
            ]
          : [{ role: "close" }]),
      ],
    },
  ];
};

module.exports = createMenuTemplate;
