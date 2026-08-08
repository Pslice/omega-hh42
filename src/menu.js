const { app } = require("electron");

const isMac = process.platform === "darwin";

/**
 * @param {object} actions
 * @param {(unit: "C"|"F") => void} actions.onSetUnit
 * @param {() => "C"|"F"} actions.getUnit
 * @param {() => void} actions.onOpenDataFolder
 */
const createMenuTemplate = ({ onSetUnit, getUnit, onOpenDataFolder }) => {
  const unitItem = (label, unit) => ({
    label,
    // Radio items keep the menu in sync with the scale the meter reports,
    // which the previous plain click-handlers could not show.
    type: "radio",
    checked: getUnit() === unit,
    click: () => onSetUnit(unit),
  });

  return [
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

    {
      label: "File",
      submenu: [
        {
          label: "Temperature Units",
          submenu: [unitItem("Celsius", "C"), unitItem("Fahrenheit", "F")],
        },
        { type: "separator" },
        { label: "Open Data Folder", click: onOpenDataFolder },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },

    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },

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
