import { recordTemperature } from "./db.js";

let currentUnit = "C";

let chartData = {
  y: [],
  type: "scatter",
  mode: "lines",
  name: "Temperature",
  line: {
    color: "#f87171",
    width: 2,
  },
  fill: "tozeroy",
  fillcolor: "rgba(248, 113, 113, 0.1)",
};

const layout = {
  title: {
    text: "Temperature",
    font: {
      color: "#e2e8f0",
      size: 16,
    },
  },
  xaxis: {
    title: "Time",
    gridcolor: "#334155",
    color: "#94a3b8",
    linecolor: "#334155",
    zerolinecolor: "#334155",
  },
  yaxis: {
    title: "°C",
    gridcolor: "#334155",
    color: "#94a3b8",
    linecolor: "#334155",
    zerolinecolor: "#334155",
  },
  plot_bgcolor: "rgba(0,0,0,0)",
  paper_bgcolor: "rgba(0,0,0,0)",
  margin: { t: 40, r: 20, b: 40, l: 50 },
  font: {
    family: "system-ui, -apple-system, sans-serif",
  },
};

const config = {
  displayModeBar: false,
  responsive: true,
};

// Initialize the plot
Plotly.newPlot("chart", [chartData], layout, config);

let counter = 0;
const temperatureData = [];

function handleTemperatureData(data, unit = "C") {
  // Update unit if it changed
  if (unit && unit !== currentUnit) {
    currentUnit = unit;
    Plotly.relayout("chart", {
      "yaxis.title": unit === "F" ? "°F" : "°C",
    });
  }

  Plotly.extendTraces(
    "chart",
    {
      y: [[data]],
    },
    [0],
  );
  temperatureData.push(data);

  recordTemperature(data, currentUnit);
  const maxTemperature = Math.max(...temperatureData);
  const minTemperature = Math.min(...temperatureData);
  if (temperatureData.length > 25) {
    temperatureData.shift();
  }
  const rangePadding = (maxTemperature - minTemperature) * 0.3;
  counter++;

  if (counter > 20) {
    Plotly.relayout("chart", {
      xaxis: {
        range: [counter - 20, counter],
        title: "Time",
        gridcolor: "#334155",
        color: "#94a3b8",
        linecolor: "#334155",
      },
      yaxis: {
        range: [minTemperature - rangePadding, maxTemperature + rangePadding],
        title: currentUnit === "F" ? "°F" : "°C",
        gridcolor: "#334155",
        color: "#94a3b8",
        linecolor: "#334155",
      },
    });
  }
}

// Listen for serial data from device (receives both data and unit)
window.API.onSerialData((data, unit) => {
  handleTemperatureData(data, unit);
});

// Listen for simulated temperature data (always Celsius)
window.addEventListener("simulatedTemperature", (e) => {
  handleTemperatureData(e.detail, "C");
});
