const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'prices.db');

let db = null;

function getDb() {
  if (!db) {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    initSchema();
  }
  return db;
}

function initSchema() {
  const schema = `
    CREATE TABLE IF NOT EXISTS price_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT UNIQUE NOT NULL,
      cabezas INTEGER DEFAULT 0,
      importe REAL DEFAULT 0,
      inmag REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_fecha ON price_records(fecha);
  `;

  db.exec(schema);
  console.log('Database initialized at', DB_PATH);
}

function insertRecord(record) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO price_records (fecha, cabezas, importe, inmag)
    VALUES (@fecha, @cabezas, @importe, @inmag)
    ON CONFLICT(fecha) DO UPDATE SET
      cabezas = @cabezas,
      importe = @importe,
      inmag = @inmag
  `);

  return stmt.run(record);
}

function insertMany(records) {
  const db = getDb();
  const insert = db.transaction((items) => {
    let count = 0;
    for (const record of items) {
      insertRecord(record);
      count++;
    }
    return count;
  });

  return insert(records);
}

function getLatest(limit = 1) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM price_records
    ORDER BY fecha DESC
    LIMIT ?
  `);

  return stmt.all(limit);
}

function getHistory(days = 30) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM price_records
    ORDER BY fecha DESC
    LIMIT ?
  `);

  return stmt.all(days);
}

function getAll() {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM price_records ORDER BY fecha DESC');
  return stmt.all();
}

function getMonthlyAverage(year, month) {
  const db = getDb();
  const monthStr = String(month).padStart(2, '0');
  const pattern = `${year}-${monthStr}%`;

  const stmt = db.prepare(`
    SELECT
      COUNT(*) as days,
      ROUND(AVG(cabezas), 0) as avg_cabezas,
      ROUND(AVG(importe), 2) as avg_importe,
      ROUND(AVG(inmag), 2) as avg_inmag,
      ROUND(SUM(cabezas), 0) as total_cabezas,
      ROUND(SUM(importe), 2) as total_importe,
      MIN(fecha) as first_date,
      MAX(fecha) as last_date
    FROM price_records
    WHERE fecha LIKE ?
  `);

  return stmt.get(pattern);
}

function getLastMonthStats() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed, so this is last month

  if (month === 0) {
    month = 12;
    year -= 1;
  }

  return {
    year,
    month,
    monthName: getMonthName(month),
    ...getMonthlyAverage(year, month)
  };
}

function getMonthName(month) {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return months[month - 1] || '';
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  insertRecord,
  insertMany,
  getLatest,
  getHistory,
  getAll,
  getMonthlyAverage,
  getLastMonthStats,
  close
};
