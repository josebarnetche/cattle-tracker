const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { scrapePrices } = require('./scraper');
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
        monthName: getMonthName(month),
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

function getMonthName(month) {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return months[month - 1] || '';
}

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
  console.log('Running initial scrape...');
  try {
    const records = await scrapePrices();
    if (records.length > 0) {
      db.insertMany(records);
      console.log(`Initial scrape: saved ${records.length} records`);
    }
  } catch (error) {
    console.error('Initial scrape failed:', error.message);
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
