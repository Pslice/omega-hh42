// database.js - SQLite database module for temperature storage
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

class TemperatureDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, "temperatures.db");
    this.db = null;
  }

  initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Create temperatures table if it doesn't exist
        this.db.run(
          `
                    CREATE TABLE IF NOT EXISTS temperatures (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        temperature_value REAL NOT NULL,
                        temperature_unit TEXT NOT NULL,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `,
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          },
        );
      });
    });
  }

  recordTemperature(temperatureValue, temperatureUnit) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(
        "INSERT INTO temperatures (temperature_value, temperature_unit) VALUES (?, ?)",
      );
      stmt.run(temperatureValue, temperatureUnit, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, temperatureValue, temperatureUnit });
        }
      });
      stmt.finalize();
    });
  }

  getTemperatures(startDate = null, endDate = null) {
    return new Promise((resolve, reject) => {
      let query = "SELECT * FROM temperatures";
      const params = [];

      if (startDate && endDate) {
        query += " WHERE timestamp BETWEEN ? AND ?";
        params.push(startDate, endDate);
      }

      query += " ORDER BY timestamp DESC";

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  clearAllTemperatures() {
    return new Promise((resolve, reject) => {
      this.db.run("DELETE FROM temperatures", (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = TemperatureDatabase;
