let chartData = {
    y: [],
    type: 'scatter',
    mode: 'lines',
    name: 'Temperature',
    line: {
        color: 'red'
    }
};
const layout = {
    title: 'Temperature',
    xaxis: {
        title: 'Time'
    }
};

const config = {
    displayModeBar: false,
    responsive: true
};

// Initialize the plot
Plotly.newPlot('chart', [chartData], layout, config);

let counter = 0;

// Listen for serial data
window.API.onSerialData((data, unit) => {
    // Extend the chart with new data
    Plotly.extendTraces('chart', {
        y: [[data]]
    }, [0]);

    counter++;

    // Keep only last 50 points visible
    if (counter > 50) {
        Plotly.relayout('chart', {
            xaxis: {
                range: [counter - 50, counter],
                showticklabels: false
            }
        });
    }
    const maxTemperature = Math.max(...chartData.y.flat());
    const minTemperature = Math.min(...chartData.y.flat());

    const rangePadding = (maxTemperature - minTemperature) * 0.3;
    Plotly.relayout('chart', {
        yaxis: {
            range: [minTemperature - rangePadding, maxTemperature + rangePadding]
        }
    });
});
