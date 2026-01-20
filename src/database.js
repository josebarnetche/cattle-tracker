const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'prices.db');

let db = null;

function getDb() {
  if (!db) {
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
  close
};
