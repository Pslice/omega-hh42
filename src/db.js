// db.js temperature omega_red want2turnUptheheat!

// API configuration
const API_KEY = 'omega_red_want2turnUptheheat!';
const API_ENDPOINT = 'https://patrickcool.net/api/v1/'; // Adjust this to match your API endpoint path

// Helper function to make API requests
async function fetchWithAuth(endpoint, method = 'GET', body = {}) {
    const myHeaders = new Headers();
    myHeaders.append("X-API-Key", API_KEY);
    myHeaders.append("Content-Type", "application/json");

    const response = await fetch(endpoint, {
        method: method,
        headers: myHeaders,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
}

async function getTemperatures(startDate = null, endDate = null) {
    let url = API_ENDPOINT;
    if (startDate && endDate) {
        url += `?start_date=${startDate}&end_date=${endDate}`;
    }

    return fetchWithAuth(url, 'GET');
}

// Record new temperature
async function recordTemperature(temperatureValue, temperatureUnit) {
    return fetchWithAuth(API_ENDPOINT, 'POST', {
        temperature_value: temperatureValue,
        temperature_unit: temperatureUnit,
    });
}

// Export functions
export {
    getTemperatures,
    recordTemperature,
};
