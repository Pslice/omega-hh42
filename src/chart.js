/* global Plotly */

/**
 * Rolling temperature chart.
 *
 * This module no longer subscribes to IPC itself. It used to register its own
 * serial-data listener alongside the one in renderer.js, so both files pushed
 * readings independently and chart.js also wrote every single reading to the
 * database as a side effect of drawing it. renderer.js now owns the data flow
 * and calls into here.
 */

/** Points retained in the trace. Plotly trims the rest for us. */
const MAX_POINTS = 1800; // ~15 minutes at the meter's 524 ms cadence

/** Width of the visible window, in milliseconds. */
const WINDOW_MS = 2 * 60 * 1000;

const AXIS_STYLE = {
  gridcolor: "#334155",
  color: "#94a3b8",
  linecolor: "#334155",
  zerolinecolor: "#334155",
};

let unit = "C";
let pointCount = 0;

export function initChart() {
  const trace = {
    x: [],
    y: [],
    // SVG rather than WebGL: 1800 points is well within SVG's comfort zone,
    // and scattergl renders blank if the WebGL context is lost, which happens
    // routinely over Remote Desktop and on machines with no GPU driver.
    type: "scatter",
    mode: "lines",
    name: "Temperature",
    line: { color: "#f87171", width: 2 },
    fill: "tozeroy",
    fillcolor: "rgba(248, 113, 113, 0.1)",
    hovertemplate: "%{y}°%{meta}<br>%{x|%H:%M:%S}<extra></extra>",
    meta: unit,
  };

  const layout = {
    // The x axis is real wall-clock time rather than a sample counter, so a
    // gap in the data reads as a gap instead of being silently compressed.
    xaxis: { ...AXIS_STYLE, type: "date", title: { text: "Time" } },
    yaxis: { ...AXIS_STYLE, title: { text: `°${unit}` } },
    plot_bgcolor: "rgba(0,0,0,0)",
    paper_bgcolor: "rgba(0,0,0,0)",
    margin: { t: 16, r: 20, b: 40, l: 56 },
    showlegend: false,
    font: { family: "system-ui, -apple-system, sans-serif", color: "#e2e8f0" },
  };

  return Plotly.newPlot("chart", [trace], layout, {
    displayModeBar: false,
    responsive: true,
  });
}

export function setChartUnit(nextUnit) {
  if (nextUnit === unit) return;
  unit = nextUnit;
  // Mixing scales in one trace would draw a meaningless 30-degree step, so
  // start a fresh series when the meter changes scale.
  clearChart();
  Plotly.relayout("chart", { "yaxis.title.text": `°${unit}` });
  Plotly.restyle("chart", { meta: unit }, [0]);
}

export function addReading(value, timestamp) {
  const time = new Date(timestamp);

  // `maxPoints` makes Plotly drop points off the front of the trace. Without
  // it the arrays grew without limit for as long as the app stayed open.
  Plotly.extendTraces("chart", { x: [[time]], y: [[value]] }, [0], MAX_POINTS);
  pointCount++;

  // Only scroll once there is more data than fits, otherwise the first few
  // readings jump around inside an over-wide window.
  if (pointCount > 2) {
    Plotly.relayout("chart", {
      "xaxis.range": [new Date(time.getTime() - WINDOW_MS), time],
      "yaxis.autorange": true,
    });
  }
}

export function clearChart() {
  pointCount = 0;
  Plotly.restyle("chart", { x: [[]], y: [[]] }, [0]);
}
