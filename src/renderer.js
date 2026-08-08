import { initChart, addReading, setChartUnit, clearChart } from "./chart.js";

/**
 * Single entry point for the renderer. It owns the reading pipeline:
 *
 *   source (device or simulator) -> display -> chart -> optional DB write
 *
 * Database writes are opt-in. The previous build recorded every reading
 * automatically from inside chart.js, which meant simply opening the app
 * started writing a row per second - including simulated data.
 */

const SIMULATE = "simulate";

/** Options for the "Log every" selector, in milliseconds. 0 = every reading. */
const LOG_INTERVALS = [
  { label: "Every reading", value: 0 },
  { label: "1 second", value: 1000 },
  { label: "5 seconds", value: 5000 },
  { label: "30 seconds", value: 30000 },
  { label: "1 minute", value: 60000 },
  { label: "5 minutes", value: 300000 },
];

/** Rows fetched into the data modal at once. */
const TABLE_PAGE_SIZE = 500;

const el = (id) => document.getElementById(id);

// Drives the platform-conditional title bar rules in input.css.
document.documentElement.classList.add(`platform-${window.API.platform}`);

const state = {
  unit: "C",
  logging: false,
  logIntervalMs: 0,
  lastLoggedAt: 0,
  simulationTimer: null,
  connecting: false,
};

document.addEventListener("DOMContentLoaded", () => {
  main().catch((error) => {
    console.error("Error initializing OmegaHH42:", error);
    setStatus("error", cleanIpcError(error));
  });
});

async function main() {
  await initChart();
  setupLoggingControls();
  setupDataModal();
  setupUpdateBanner();
  subscribeToDevice();

  await populatePorts();
  el("refresh-ports-button").addEventListener("click", refreshPorts);
  el("portSelect").addEventListener("change", handlePortChange);

  // Start in simulation so the UI is alive before any hardware is attached.
  await handlePortChange();
}

// --- readings -----------------------------------------------------------

function handleReading(value, unit, timestamp) {
  if (unit && unit !== state.unit) {
    state.unit = unit;
    setChartUnit(unit);
  }

  el("temperature").textContent = value.toFixed(2);
  el("unit").textContent = `°${state.unit}`;
  addReading(value, timestamp);

  maybeLog(value, timestamp);
}

function maybeLog(value, timestamp) {
  if (!state.logging) return;

  const now = new Date(timestamp).getTime();
  if (state.logIntervalMs > 0 && now - state.lastLoggedAt < state.logIntervalMs) {
    return;
  }
  state.lastLoggedAt = now;

  window.API.db.record(value, state.unit, timestamp).catch((error) => {
    console.error("Failed to record temperature:", error);
    setLogging(false);
    setStatus("error", `Logging stopped: ${cleanIpcError(error)}`);
  });
}

function subscribeToDevice() {
  // Subscribed exactly once, at startup. Re-subscribing per port change was
  // what caused duplicate readings after switching ports.
  window.API.device.onReading(({ value, unit, timestamp }) =>
    handleReading(value, unit, timestamp),
  );

  window.API.device.onOutOfRange(({ direction }) => {
    el("temperature").textContent = direction === "under" ? "LO" : "HI";
    setStatus("warn", `Probe reading is ${direction} range`);
  });

  window.API.device.onUnitChange((unit) => {
    state.unit = unit;
    setChartUnit(unit);
    el("unit").textContent = `°${unit}`;
  });

  window.API.device.onStatus((status) => {
    switch (status.state) {
      case "connecting":
        setStatus("pending", `Connecting to ${status.port}...`);
        break;
      case "connected":
        setStatus("ok", `Connected to ${status.port}`);
        break;
      case "disconnected":
        setStatus("warn", "Device disconnected");
        break;
      case "stalled":
        setStatus("warn", status.message);
        break;
      case "error":
        setStatus("error", status.message);
        break;
    }
  });
}

// --- simulation ---------------------------------------------------------

function startSimulation() {
  let baseTemp = 22.0;
  let trend = 0;

  state.simulationTimer = setInterval(() => {
    trend = clamp(trend + (Math.random() - 0.5) * 0.1, -0.5, 0.5);
    baseTemp = clamp(baseTemp + trend + (Math.random() - 0.5) * 0.3, 15, 35);

    const celsius = Number(baseTemp.toFixed(2));
    const value = state.unit === "F" ? celsius * 1.8 + 32 : celsius;
    handleReading(Number(value.toFixed(2)), state.unit, new Date().toISOString());
  }, 1000);
}

function stopSimulation() {
  if (state.simulationTimer) {
    clearInterval(state.simulationTimer);
    state.simulationTimer = null;
  }
}

// --- ports --------------------------------------------------------------

async function populatePorts() {
  const portSelect = el("portSelect");
  const previous = portSelect.value;
  portSelect.replaceChildren();

  portSelect.appendChild(new Option("Simulate", SIMULATE));

  const ports = await window.API.device.listPorts();
  // Every serial port is listed. Filtering on `manufacturer === "FTDI"` hid
  // the device on any machine whose cable used a Prolific, CP210x or CH340
  // bridge, or where Windows reported the driver vendor instead.
  const likely = ports.filter((p) => p.likely);
  const rest = ports.filter((p) => !p.likely);

  for (const port of [...likely, ...rest]) {
    portSelect.appendChild(new Option(port.label, port.path));
  }

  if ([...portSelect.options].some((o) => o.value === previous)) {
    portSelect.value = previous;
  }
  return ports.length;
}

async function refreshPorts() {
  const button = el("refresh-ports-button");
  button.classList.add("animate-spin");
  try {
    const count = await populatePorts();
    if (count === 0) setStatus("warn", "No serial ports found");
  } finally {
    setTimeout(() => button.classList.remove("animate-spin"), 300);
  }
}

async function handlePortChange() {
  const selected = el("portSelect").value;

  stopSimulation();
  clearChart();
  el("temperature").textContent = "--";

  if (selected === SIMULATE) {
    // Release the hardware; previously selecting Simulate left the serial
    // port open and both sources fed the chart at once.
    await window.API.device.disconnect().catch(() => {});
    setStatus("sim", "Simulation mode");
    startSimulation();
    return;
  }

  state.connecting = true;
  setStatus("pending", `Connecting to ${selected}...`);
  try {
    await window.API.device.connect(selected);
  } catch (error) {
    setStatus("error", cleanIpcError(error));
  } finally {
    state.connecting = false;
  }
}

/**
 * Electron wraps a rejected handler as
 * "Error invoking remote method 'x': Error: <real message>". Strip both layers
 * so the status line shows only the message the driver produced.
 */
function cleanIpcError(error) {
  return String(error?.message || error)
    .replace(/^Error invoking remote method '[^']*':\s*/, "")
    .replace(/^(?:Error|TypeError):\s*/, "");
}

// --- logging controls ---------------------------------------------------

function setupLoggingControls() {
  const select = el("log-interval");
  for (const option of LOG_INTERVALS) {
    select.appendChild(new Option(option.label, String(option.value)));
  }
  select.value = "0";
  select.addEventListener("change", () => {
    state.logIntervalMs = Number(select.value);
    state.lastLoggedAt = 0;
  });

  el("log-toggle").addEventListener("click", () => setLogging(!state.logging));
  setLogging(false);
}

function setLogging(enabled) {
  state.logging = enabled;
  state.lastLoggedAt = 0;

  const button = el("log-toggle");
  button.textContent = enabled ? "Stop Logging" : "Start Logging";
  button.classList.toggle("bg-red-600", enabled);
  button.classList.toggle("hover:bg-red-500", enabled);
  button.classList.toggle("bg-emerald-600", !enabled);
  button.classList.toggle("hover:bg-emerald-500", !enabled);
  el("log-indicator").classList.toggle("hidden", !enabled);
}

// --- data modal ---------------------------------------------------------

function setupDataModal() {
  const modal = el("db-table-container-modal");
  const closeButton = el("modal-close");

  const open = async () => {
    modal.classList.remove("hidden");
    requestAnimationFrame(() => modal.classList.add("opacity-100"));
    await loadTable();
  };

  const close = () => {
    modal.classList.remove("opacity-100");
    setTimeout(() => modal.classList.add("hidden"), 300);
  };

  el("db-view-button").addEventListener("click", open);
  closeButton.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) close();
  });

  el("db-export-button").addEventListener("click", async () => {
    const button = el("db-export-button");
    button.disabled = true;
    try {
      // Exporting from the main process writes the full table to a location
      // the user picks, rather than the browser dumping a blob of whatever
      // happened to be cached in the modal.
      const result = await window.API.db.exportCsv();
      if (!result.canceled) {
        setModalNote(`Exported ${result.count} rows to ${result.filePath}`);
      }
    } catch (error) {
      setModalNote(`Export failed: ${cleanIpcError(error)}`, true);
    } finally {
      button.disabled = false;
    }
  });

  el("db-reset-button").addEventListener("click", async () => {
    if (
      !confirm(
        "Delete all temperature records? This cannot be undone.\n\nExport first if you need the data.",
      )
    ) {
      return;
    }
    await window.API.db.clear();
    await loadTable();
    setModalNote("All records deleted.");
  });
}

async function loadTable() {
  const table = el("db-table");
  const [rows, total] = await Promise.all([
    window.API.db.list({ limit: TABLE_PAGE_SIZE }),
    window.API.db.count(),
  ]);

  renderTable(rows, table);
  el("db-record-count").textContent =
    total > rows.length
      ? `Showing ${rows.length} of ${total} records`
      : `${total} record${total === 1 ? "" : "s"}`;
  setModalNote("");
}

function renderTable(rows, table) {
  table.replaceChildren();

  if (!rows.length) {
    const body = table.createTBody();
    const cell = body.insertRow().insertCell();
    cell.className = "p-6 text-center text-slate-500";
    cell.textContent = "No temperature data recorded yet";
    return;
  }

  const head = table.createTHead();
  head.className = "sticky top-0 bg-slate-800 text-slate-300";
  const headRow = head.insertRow();
  for (const label of ["ID", "Temperature", "Unit", "Timestamp"]) {
    const th = document.createElement("th");
    th.className = "px-4 py-3 text-left font-medium";
    th.textContent = label;
    headRow.appendChild(th);
  }

  // Built with DOM nodes rather than an innerHTML template so stored values
  // can never be interpreted as markup.
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    tr.className = "border-t border-slate-700/50 hover:bg-slate-800/50";
    addCell(tr, row.id, "tabular-nums");
    addCell(tr, row.value, "tabular-nums");
    addCell(tr, `°${row.unit}`);
    addCell(tr, formatTimestamp(row.timestamp), "tabular-nums");
  }
}

function addCell(row, value, extraClass = "") {
  const cell = row.insertCell();
  cell.className = `px-4 py-2 ${extraClass}`.trim();
  cell.textContent = String(value);
}

function setModalNote(message, isError = false) {
  const note = el("db-note");
  note.textContent = message;
  note.classList.toggle("text-red-400", isError);
  note.classList.toggle("text-slate-400", !isError);
}

/**
 * Timestamps arrive as ISO-8601 UTC. Handing a "YYYY-MM-DD HH:MM:SS" string
 * (what SQLite's CURRENT_TIMESTAMP produced before) straight to `new Date()`
 * made the browser read UTC values as local time, shifting every displayed
 * row by the machine's UTC offset.
 */
function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// --- status + updates ---------------------------------------------------

const STATUS_COLORS = {
  ok: "bg-emerald-500",
  sim: "bg-sky-500",
  pending: "bg-amber-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
};

function setStatus(kind, message) {
  const dot = el("status-dot");
  dot.className = `h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_COLORS[kind] || "bg-slate-500"}`;
  const text = el("status-text");
  text.textContent = message;
  text.title = message;
}

function setupUpdateBanner() {
  const banner = el("update-banner");
  const message = el("update-message");
  const actionButton = el("update-action-btn");

  const show = (text, actionLabel, handler) => {
    message.textContent = text;
    banner.classList.remove("hidden");
    banner.classList.add("flex");
    if (actionLabel && handler) {
      actionButton.textContent = actionLabel;
      actionButton.classList.remove("hidden");
      actionButton.onclick = handler;
    } else {
      actionButton.classList.add("hidden");
    }
  };

  el("update-dismiss-btn").addEventListener("click", () => {
    banner.classList.add("hidden");
    banner.classList.remove("flex");
  });

  window.API.updates.onStatus((status, data) => {
    switch (status) {
      case "available":
        show(`Update v${data.version} is available`, "Download", () => {
          window.API.updates.download();
          actionButton.classList.add("hidden");
          message.textContent = "Starting download...";
        });
        break;
      case "progress":
        show(`Downloading update... ${Math.round(data.percent)}%`);
        break;
      case "downloaded":
        show("Update downloaded. Restart to install.", "Restart Now", () =>
          window.API.updates.install(),
        );
        break;
      case "error":
        console.error("Update error:", data);
        break;
    }
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
