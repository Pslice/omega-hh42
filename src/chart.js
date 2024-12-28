import { recordTemperature } from './db.js';
let chartData = {
    y: [],
    type: 'scatter',
    mode: 'lines',
    name: 'Temperature',
    line: {
        color: '#ef4444'
    }
};
const layout = {
    title: {
        text: 'Temperature',
        font: {
            color: '#cbd5e1'
        }
    },
    xaxis: {
        title: 'Time',
        gridcolor: '#d1d5db',
        color: '#d1d5db'
    },
    yaxis: {
        title: '°C',
        gridcolor: '#d1d5db',
        color: '#cbd5e1'
    },
    plot_bgcolor: '#334155',  // Light gray background for the plot area
    paper_bgcolor: '#334155'
};

const config = {
    displayModeBar: false,
    responsive: true
};

// Initialize the plot
Plotly.newPlot('chart', [chartData], layout, config);

let counter = 0;
const temperatureData = [];
// Listen for serial data
window.API.onSerialData((data) => {

    Plotly.extendTraces('chart', {
        y: [[data]]
    }, [0]);
    temperatureData.push(data);

    recordTemperature(data, 'C');
    const maxTemperature = Math.max(...temperatureData);
    const minTemperature = Math.min(...temperatureData);
    if (temperatureData.length > 25) {
        temperatureData.shift();
    }
    const rangePadding = (maxTemperature - minTemperature) * 0.3;
    counter++;

    if (counter > 50) {
        Plotly.relayout('chart', {
            xaxis: {
                range: [counter - 50, counter],
            },
            yaxis: {
                range: [minTemperature - rangePadding, maxTemperature + rangePadding],
                title: '°C'
            }
        });
    }


});
