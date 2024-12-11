// db.js temperature omega_red want2turnUptheheat!
// sqlite3
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('temperature.db');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS temperature (id INTEGER PRIMARY KEY AUTOINCREMENT, temperature REAL)");
});



