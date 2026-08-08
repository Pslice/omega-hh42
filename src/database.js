// database.js - SQLite storage for temperature readings.
const sqlite3 = require("sqlite3");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Timestamps are stored as ISO-8601 UTC strings ("2026-08-07T13:45:01.123Z")
 * rather than SQLite's CURRENT_TIMESTAMP. CURRENT_TIMESTAMP produces
 * "YYYY-MM-DD HH:MM:SS" with no zone marker, which `new Date(...)` in the
 * renderer parses as *local* time - so every logged reading displayed with an
 * offset equal to the machine's UTC offset. ISO strings round-trip correctly
 * and still sort lexicographically, which keeps range queries working.
 */
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;

class TemperatureDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  async initialize() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });

    this.db = await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, (err) =>
        err ? reject(err) : resolve(db),
      );
    });

    // WAL keeps the writer from blocking the reader when the data modal is
    // open while logging is running; busy_timeout covers the brief overlap.
    await this.#exec("PRAGMA journal_mode = WAL");
    await this.#exec("PRAGMA busy_timeout = 5000");
    await this.#exec(`
      CREATE TABLE IF NOT EXISTS temperatures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        temperature_value REAL NOT NULL,
        temperature_unit TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);
    await this.#exec(
      "CREATE INDEX IF NOT EXISTS idx_temperatures_timestamp ON temperatures (timestamp)",
    );
  }

  recordTemperature(value, unit, timestamp) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new Error(`Refusing to store non-numeric temperature: ${value}`);
    }
    const scale = unit === "F" ? "F" : "C";
    const when = normalizeTimestamp(timestamp) || new Date().toISOString();

    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO temperatures (temperature_value, temperature_unit, timestamp) VALUES (?, ?, ?)",
        [numeric, scale, when],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, value: numeric, unit: scale, timestamp: when });
        },
      );
    });
  }

  /**
   * Most recent readings first. `limit` is capped because the data modal
   * renders every returned row - an unbounded SELECT over a multi-day log
   * would build a string with hundreds of thousands of rows in it.
   */
  getTemperatures({ startDate = null, endDate = null, limit = 1000, offset = 0 } = {}) {
    const params = [];
    let query = "SELECT id, temperature_value, temperature_unit, timestamp FROM temperatures";

    const start = normalizeTimestamp(startDate);
    const end = normalizeTimestamp(endDate);
    if (start && end) {
      query += " WHERE timestamp BETWEEN ? AND ?";
      params.push(start, end);
    } else if (start) {
      query += " WHERE timestamp >= ?";
      params.push(start);
    } else if (end) {
      query += " WHERE timestamp <= ?";
      params.push(end);
    }

    query += " ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?";
    params.push(clampLimit(limit), Math.max(0, Number(offset) || 0));

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(normalizeRow));
      });
    });
  }

  countTemperatures() {
    return new Promise((resolve, reject) => {
      this.db.get("SELECT COUNT(*) AS total FROM temperatures", (err, row) => {
        if (err) reject(err);
        else resolve(row.total);
      });
    });
  }

  clearAllTemperatures() {
    return new Promise((resolve, reject) => {
      this.db.run("DELETE FROM temperatures", (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  close() {
    const db = this.db;
    this.db = null;
    if (!db) return Promise.resolve();
    return new Promise((resolve, reject) => {
      db.close((err) => (err ? reject(err) : resolve()));
    });
  }

  #exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, (err) => (err ? reject(err) : resolve()));
    });
  }
}

function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return 1000;
  return Math.min(Math.floor(n), 100000);
}

/**
 * Accepts Date objects, ISO strings, and legacy "YYYY-MM-DD HH:MM:SS" rows
 * written by earlier versions (which were UTC despite carrying no zone).
 */
function normalizeTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const text = String(value).trim();
  if (!text) return null;
  if (ISO_LIKE.test(text) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
    const parsed = new Date(`${text.replace(" ", "T")}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeRow(row) {
  return {
    id: row.id,
    value: row.temperature_value,
    unit: row.temperature_unit,
    timestamp: normalizeTimestamp(row.timestamp) || row.timestamp,
  };
}

module.exports = TemperatureDatabase;
module.exports.normalizeTimestamp = normalizeTimestamp;
