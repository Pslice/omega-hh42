// db.js - Database operations using local SQLite via IPC

async function getTemperatures(startDate = null, endDate = null) {
  return window.API.getTemperatures(startDate, endDate);
}

async function recordTemperature(temperatureValue, temperatureUnit) {
  console.log("recordTemperature", temperatureValue, temperatureUnit);
  return window.API.recordTemperature(temperatureValue, temperatureUnit);
}

export { getTemperatures, recordTemperature };
