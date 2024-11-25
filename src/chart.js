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

// Listen for serial data
window.API.onSerialData((data) => {

    Plotly.extendTraces('chart', {
        y: [[data]]
    }, [0]);

    counter++;

    if (counter > 50) {
        Plotly.relayout('chart', {
            xaxis: {
                range: [counter - 50, counter],
            }
        });
    }



    const maxTemperature = Math.max(...data);
    const minTemperature = Math.min(...data);

    const rangePadding = (maxTemperature - minTemperature) * 0.3;
    Plotly.relayout('chart', {
        yaxis: {
            range: [minTemperature - rangePadding, maxTemperature + rangePadding],
            title: '°C'
        }
    });
});
