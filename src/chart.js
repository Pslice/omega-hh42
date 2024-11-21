let chartData = {
    y: [],
    type: 'line',
    name: 'Temperature',

};

// Initialize the plot
Plotly.newPlot('chart', [chartData], {
    title: 'Temperature',
    xaxis: {
        title: 'Time'
    }
});

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
                range: [counter - 50, counter]
            }
        });
    }
});
