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
    WHERE fecha LIKE ? AND inmag > 0
  `);

  return stmt.get(pattern);
}

function getLastMonthStats() {
  const now = new Date();
  let year = now.getFullYear();
  // getMonth() is 0-indexed (0=Jan), which equals last month's 1-indexed value
  // e.g., in February (getMonth()=1), last month is January (month 1)
  let month = now.getMonth();

  // Handle January: last month is December of previous year
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

// Clean bad data from database (invalid dates and zero INMAG values)
function cleanBadData() {
  const db = getDb();

  // Delete records with invalid dates (not YYYY-MM-DD format)
  const deleteInvalidDates = db.prepare(`
    DELETE FROM price_records
    WHERE fecha NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  `);

  // Delete records with inmag = 0 (market closed days)
  const deleteZeroInmag = db.prepare(`
    DELETE FROM price_records WHERE inmag = 0 OR inmag IS NULL
  `);

  const result1 = deleteInvalidDates.run();
  const result2 = deleteZeroInmag.run();

  console.log(`Cleanup: removed ${result1.changes} invalid dates, ${result2.changes} zero INMAG records`);

  return {
    invalidDatesRemoved: result1.changes,
    zeroInmagRemoved: result2.changes
  };
}

// Get records for a date range
function getRange(startDate, endDate) {
  const db = getDb();

  if (startDate && endDate) {
    const stmt = db.prepare(`
      SELECT * FROM price_records
      WHERE fecha BETWEEN ? AND ? AND inmag > 0
      ORDER BY fecha DESC
    `);
    return stmt.all(startDate, endDate);
  }

  return getAll();
}

// Get statistics for a date range
function getRangeStats(startDate, endDate) {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT
      COUNT(*) as days,
      ROUND(AVG(inmag), 2) as avg_inmag,
      ROUND(MIN(inmag), 2) as min_inmag,
      ROUND(MAX(inmag), 2) as max_inmag,
      ROUND(AVG(cabezas), 0) as avg_cabezas,
      ROUND(SUM(cabezas), 0) as total_cabezas,
      ROUND(SUM(importe), 2) as total_importe,
      MIN(fecha) as first_date,
      MAX(fecha) as last_date
    FROM price_records
    WHERE fecha BETWEEN ? AND ? AND inmag > 0
  `);

  const stats = stmt.get(startDate, endDate);

  // Calculate volatility (standard deviation)
  const volatilityStmt = db.prepare(`
    SELECT ROUND(
      SQRT(AVG((inmag - sub.avg) * (inmag - sub.avg))), 2
    ) as volatility
    FROM price_records,
    (SELECT AVG(inmag) as avg FROM price_records WHERE fecha BETWEEN ? AND ? AND inmag > 0) sub
    WHERE fecha BETWEEN ? AND ? AND inmag > 0
  `);

  const volatility = volatilityStmt.get(startDate, endDate, startDate, endDate);

  return { ...stats, volatility: volatility?.volatility || 0 };
}

// Get trend indicators (week-over-week, month-over-month)
function getTrends() {
  const db = getDb();

  // Get current week vs last week
  const weeklyTrend = db.prepare(`
    WITH current_week AS (
      SELECT AVG(inmag) as avg FROM price_records
      WHERE fecha >= date('now', '-7 days') AND inmag > 0
    ),
    last_week AS (
      SELECT AVG(inmag) as avg FROM price_records
      WHERE fecha >= date('now', '-14 days')
        AND fecha < date('now', '-7 days')
        AND inmag > 0
    )
    SELECT
      ROUND(current_week.avg, 2) as current_avg,
      ROUND(last_week.avg, 2) as previous_avg,
      ROUND(((current_week.avg - last_week.avg) / last_week.avg) * 100, 2) as change_percent
    FROM current_week, last_week
  `).get();

  // Get current month vs last month
  const monthlyTrend = db.prepare(`
    WITH current_month AS (
      SELECT AVG(inmag) as avg FROM price_records
      WHERE strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now') AND inmag > 0
    ),
    last_month AS (
      SELECT AVG(inmag) as avg FROM price_records
      WHERE strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now', '-1 month') AND inmag > 0
    )
    SELECT
      ROUND(current_month.avg, 2) as current_avg,
      ROUND(last_month.avg, 2) as previous_avg,
      ROUND(((current_month.avg - last_month.avg) / last_month.avg) * 100, 2) as change_percent
    FROM current_month, last_month
  `).get();

  return {
    weekly: weeklyTrend,
    monthly: monthlyTrend
  };
}

// Get monthly comparison for last N months
function getMonthlyComparison(numMonths = 6) {
  const results = [];
  const now = new Date();

  for (let i = 0; i < numMonths; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    const stats = getMonthlyAverage(year, month);
    if (stats && stats.days > 0) {
      results.push({
        year,
        month,
        monthName: getMonthName(month),
        ...stats
      });
    }
  }

  return results.reverse(); // Oldest first for charts
}

// Get yearly statistics with volatility
function getYearlyStats(year = null) {
  const db = getDb();
  const targetYear = year || new Date().getFullYear();

  const stmt = db.prepare(`
    SELECT
      COUNT(*) as days,
      ROUND(AVG(inmag), 2) as avg_inmag,
      ROUND(MIN(inmag), 2) as min_inmag,
      ROUND(MAX(inmag), 2) as max_inmag,
      ROUND(AVG(cabezas), 0) as avg_cabezas,
      ROUND(SUM(cabezas), 0) as total_cabezas,
      ROUND(SUM(importe), 2) as total_importe,
      MIN(fecha) as first_date,
      MAX(fecha) as last_date
    FROM price_records
    WHERE strftime('%Y', fecha) = ? AND inmag > 0
  `);

  const stats = stmt.get(String(targetYear));

  // Calculate volatility (standard deviation)
  const volatilityStmt = db.prepare(`
    SELECT ROUND(
      SQRT(AVG((inmag - sub.avg) * (inmag - sub.avg))), 2
    ) as volatility
    FROM price_records,
    (SELECT AVG(inmag) as avg FROM price_records WHERE strftime('%Y', fecha) = ? AND inmag > 0) sub
    WHERE strftime('%Y', fecha) = ? AND inmag > 0
  `);

  const volatility = volatilityStmt.get(String(targetYear), String(targetYear));

  // Get monthly breakdown for the year
  const monthlyStmt = db.prepare(`
    SELECT
      strftime('%m', fecha) as month,
      COUNT(*) as days,
      ROUND(AVG(inmag), 2) as avg_inmag,
      ROUND(MIN(inmag), 2) as min_inmag,
      ROUND(MAX(inmag), 2) as max_inmag,
      ROUND(AVG(cabezas), 0) as avg_cabezas
    FROM price_records
    WHERE strftime('%Y', fecha) = ? AND inmag > 0
    GROUP BY strftime('%m', fecha)
    ORDER BY month
  `);

  const monthlyBreakdown = monthlyStmt.all(String(targetYear)).map(m => ({
    ...m,
    month: parseInt(m.month),
    monthName: getMonthName(parseInt(m.month))
  }));

  return {
    year: targetYear,
    ...stats,
    volatility: volatility?.volatility || 0,
    volatility_percent: stats?.avg_inmag ? ((volatility?.volatility || 0) / stats.avg_inmag * 100).toFixed(2) : 0,
    monthly: monthlyBreakdown
  };
}

// Get all-time statistics
function getAllTimeStats() {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total_days,
      ROUND(AVG(inmag), 2) as avg_inmag,
      ROUND(MIN(inmag), 2) as min_inmag,
      ROUND(MAX(inmag), 2) as max_inmag,
      ROUND(AVG(cabezas), 0) as avg_cabezas,
      ROUND(SUM(cabezas), 0) as total_cabezas,
      MIN(fecha) as first_date,
      MAX(fecha) as last_date
    FROM price_records
    WHERE inmag > 0
  `);

  const stats = stmt.get();

  // Volatility
  const volatilityStmt = db.prepare(`
    SELECT ROUND(
      SQRT(AVG((inmag - sub.avg) * (inmag - sub.avg))), 2
    ) as volatility
    FROM price_records,
    (SELECT AVG(inmag) as avg FROM price_records WHERE inmag > 0) sub
    WHERE inmag > 0
  `);

  const volatility = volatilityStmt.get();

  // Get yearly breakdown
  const yearlyStmt = db.prepare(`
    SELECT
      strftime('%Y', fecha) as year,
      COUNT(*) as days,
      ROUND(AVG(inmag), 2) as avg_inmag,
      ROUND(MIN(inmag), 2) as min_inmag,
      ROUND(MAX(inmag), 2) as max_inmag
    FROM price_records
    WHERE inmag > 0
    GROUP BY strftime('%Y', fecha)
    ORDER BY year
  `);

  const yearlyBreakdown = yearlyStmt.all();

  return {
    ...stats,
    volatility: volatility?.volatility || 0,
    volatility_percent: stats?.avg_inmag ? ((volatility?.volatility || 0) / stats.avg_inmag * 100).toFixed(2) : 0,
    yearly: yearlyBreakdown
  };
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
  getRange,
  getMonthlyAverage,
  getLastMonthStats,
  getRangeStats,
  getTrends,
  getMonthlyComparison,
  getYearlyStats,
  getAllTimeStats,
  getMonthName,
  cleanBadData,
  close
};
