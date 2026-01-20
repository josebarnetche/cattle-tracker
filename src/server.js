const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { scrapePrices, scrapeMonth } = require('./scraper');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API: Get latest prices
app.get('/api/prices', async (req, res) => {
  try {
    // First try to get from database
    let records = db.getLatest(10);

    // If no records, try scraping
    if (records.length === 0) {
      console.log('No records in DB, scraping...');
      const scraped = await scrapePrices();
      if (scraped.length > 0) {
        db.insertMany(scraped);
        records = db.getLatest(10);
      }
    }

    res.json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Get historical data
app.get('/api/history', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const records = db.getHistory(days);

    res.json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Get monthly stats (last month by default)
app.get('/api/monthly', (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : null;
    const month = req.query.month ? parseInt(req.query.month) : null;

    let stats;
    if (year && month) {
      stats = {
        year,
        month,
        monthName: db.getMonthName(month),
        ...db.getMonthlyAverage(year, month)
      };
    } else {
      stats = db.getLastMonthStats();
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Monthly stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Force refresh data
app.post('/api/refresh', async (req, res) => {
  try {
    const records = await scrapePrices();
    if (records.length > 0) {
      db.insertMany(records);
    }

    res.json({
      success: true,
      message: `Refreshed ${records.length} records`
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Load historical month data
app.post('/api/load-month', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || 2025;
    const month = parseInt(req.query.month) || 12;

    console.log(`Loading data for ${month}/${year}...`);
    const records = await scrapeMonth(year, month);

    if (records.length > 0) {
      db.insertMany(records);
    }

    res.json({
      success: true,
      message: `Loaded ${records.length} records for ${month}/${year}`
    });
  } catch (error) {
    console.error('Load month error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Get statistics for a date range
app.get('/api/stats/range', (req, res) => {
  try {
    const startDate = req.query.start;
    const endDate = req.query.end;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'start and end dates required (YYYY-MM-DD format)'
      });
    }

    const stats = db.getRangeStats(startDate, endDate);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Range stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get trend indicators
app.get('/api/stats/trends', (req, res) => {
  try {
    const trends = db.getTrends();
    res.json({ success: true, data: trends });
  } catch (error) {
    console.error('Trends error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get monthly comparison (last N months)
app.get('/api/stats/monthly-comparison', (req, res) => {
  try {
    const months = parseInt(req.query.months) || 6;
    const comparison = db.getMonthlyComparison(months);
    res.json({ success: true, data: comparison });
  } catch (error) {
    console.error('Monthly comparison error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Export data to CSV
app.get('/api/export', (req, res) => {
  try {
    const startDate = req.query.start;
    const endDate = req.query.end;

    const records = db.getRange(startDate, endDate);

    // Generate CSV
    const headers = 'Fecha,Cabezas,Importe,INMAG\n';
    const rows = records.map(r =>
      `${r.fecha},${r.cabezas},${r.importe},${r.inmag}`
    ).join('\n');
    const csv = headers + rows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=precios-hacienda.csv');
    res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Schedule hourly scraping
cron.schedule('0 * * * *', async () => {
  console.log('Running scheduled scrape...');
  try {
    const records = await scrapePrices();
    if (records.length > 0) {
      db.insertMany(records);
      console.log(`Scheduled scrape: saved ${records.length} records`);
    }
  } catch (error) {
    console.error('Scheduled scrape failed:', error.message);
  }
});

// Initial scrape on startup
async function init() {
  console.log('Running initial data load...');
  try {
    // Clean any bad data first
    const cleanup = db.cleanBadData();
    if (cleanup.invalidDatesRemoved > 0 || cleanup.zeroInmagRemoved > 0) {
      console.log(`Data cleanup completed`);
    }

    // Check if we have December 2025 data
    const decStats = db.getMonthlyAverage(2025, 12);

    if (!decStats || decStats.days < 10) {
      console.log('Loading December 2025 historical data...');
      const decRecords = await scrapeMonth(2025, 12);
      if (decRecords.length > 0) {
        db.insertMany(decRecords);
        console.log(`Loaded ${decRecords.length} records for December 2025`);
      }
    } else {
      console.log(`December 2025 data already loaded (${decStats.days} days)`);
    }

    // Also get today's data
    console.log('Fetching current data...');
    const todayRecords = await scrapePrices();
    if (todayRecords.length > 0) {
      db.insertMany(todayRecords);
      console.log(`Current scrape: saved ${todayRecords.length} records`);
    }
  } catch (error) {
    console.error('Initial load failed:', error.message);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`Cattle Price Tracker running at http://localhost:${PORT}`);
  init();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  db.close();
  process.exit(0);
});
