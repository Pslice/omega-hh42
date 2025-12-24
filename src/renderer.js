import { getTemperatures } from "./db.js";

let simulationInterval = null;

function startSimulation() {
  let baseTemp = 22.0;
  let trend = 0;

  simulationInterval = setInterval(() => {
    // Random walk with slight trend changes
    trend += (Math.random() - 0.5) * 0.1;
    trend = Math.max(-0.5, Math.min(0.5, trend));

    const noise = (Math.random() - 0.5) * 0.3;
    baseTemp += trend + noise;

    // Keep temperature in realistic range
    baseTemp = Math.max(15, Math.min(35, baseTemp));

    const simulatedTemp = parseFloat(baseTemp.toFixed(1));

    // Dispatch custom event for simulated data
    window.dispatchEvent(
      new CustomEvent("simulatedTemperature", {
        detail: simulatedTemp,
      }),
    );
  }, 1000);
}

function stopSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function renderTable(data, tableElement) {
  if (!data || data.length === 0) {
    tableElement.innerHTML = `
      <tbody>
        <tr>
          <td class="p-4 text-center text-slate-500">No temperature data recorded yet</td>
        </tr>
      </tbody>
    `;
    return;
  }

  const headerRow = `
    <thead class="sticky top-0 bg-slate-800 text-slate-300">
      <tr>
        <th class="px-4 py-3 font-medium">ID</th>
        <th class="px-4 py-3 font-medium">Temperature</th>
        <th class="px-4 py-3 font-medium">Unit</th>
        <th class="px-4 py-3 font-medium">Timestamp</th>
      </tr>
    </thead>
  `;

  const rows = data
    .map(
      (row) => `
    <tr class="border-t border-slate-700/50 hover:bg-slate-800/50">
      <td class="px-4 py-2 tabular-nums">${row.id}</td>
      <td class="px-4 py-2 tabular-nums">${row.temperature_value}</td>
      <td class="px-4 py-2">${row.temperature_unit}</td>
      <td class="px-4 py-2 tabular-nums">${formatTimestamp(row.timestamp)}</td>
    </tr>
  `,
    )
    .join("");

  tableElement.innerHTML = `${headerRow}<tbody>${rows}</tbody>`;
}

function exportToCsv(data) {
  if (!data || data.length === 0) {
    return;
  }

  const headers = ["id", "temperature_value", "temperature_unit", "timestamp"];
  const csvRows = [headers.join(",")];

  data.forEach((row) => {
    const values = [
      row.id,
      row.temperature_value,
      row.temperature_unit,
      row.timestamp,
    ];
    csvRows.push(values.join(","));
  });

  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `temperatures_${Date.now()}.csv`);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const dbViewButton = document.getElementById("db-view-button");
    const dbExportButton = document.getElementById("db-export-button");
    const dbTable = document.getElementById("db-table");
    const dbRecordCount = document.getElementById("db-record-count");

    const portSelect = document.getElementById("portSelect");
    const refreshPortsButton = document.getElementById("refresh-ports-button");
    const temperature = document.getElementById("temperature");
    const unit = document.getElementById("unit");

    async function populatePorts() {
      const currentValue = portSelect.value;

      // Clear existing options
      portSelect.innerHTML = "";

      // Add simulate option first
      const simulateOption = document.createElement("option");
      simulateOption.value = "simulate";
      simulateOption.textContent = "Simulate";
      portSelect.appendChild(simulateOption);

      const ports = await window.API.getPorts();
      ports.forEach((port) => {
        const option = document.createElement("option");
        option.value = port;
        option.textContent = port;
        portSelect.appendChild(option);
      });

      // Restore previous selection if still available
      if (
        currentValue &&
        [...portSelect.options].some((opt) => opt.value === currentValue)
      ) {
        portSelect.value = currentValue;
      }
    }

    await populatePorts();

    refreshPortsButton.addEventListener("click", async () => {
      refreshPortsButton.classList.add("animate-spin");
      await populatePorts();
      setTimeout(() => {
        refreshPortsButton.classList.remove("animate-spin");
      }, 300);
    });

    function updateTemperatureDisplay(data, unitChar) {
      temperature.textContent = data;
      unit.textContent = unitChar === "F" ? "°F" : "°C";
    }

    // Listen for simulated temperature events
    window.addEventListener("simulatedTemperature", (e) => {
      updateTemperatureDisplay(e.detail, "C");
    });

    portSelect.addEventListener("change", async () => {
      console.log("port changed");
      stopSimulation();

      if (portSelect.value === "simulate") {
        startSimulation();
      } else {
        await window.API.updatePort(portSelect.value);
        await window.API.onSerialData(updateTemperatureDisplay);
      }
    });

    portSelect.dispatchEvent(new Event("change"));

    const modal = document.getElementById("db-table-container-modal");
    const modalClose = document.getElementById("modal-close");

    let cachedData = [];

    dbViewButton.addEventListener("click", async () => {
      modal.classList.remove("hidden");
      setTimeout(() => {
        modal.classList.add("opacity-100");
      }, 10);

      // Load and display data
      cachedData = await getTemperatures();
      renderTable(cachedData, dbTable);
      dbRecordCount.textContent = `${cachedData.length} records`;
    });

    modalClose.addEventListener("click", () => {
      modal.classList.remove("opacity-100");
      setTimeout(() => {
        modal.classList.add("hidden");
      }, 300);
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modalClose.click();
      }
    });

    dbExportButton.addEventListener("click", () => {
      exportToCsv(cachedData);
    });
  } catch (error) {
    console.error("Error initializing OmegaHH42:", error);
  }
});
