const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.mercadoagroganadero.com.ar/dll/hacienda2.dll/haciinfo000011';

async function scrapePrices(startDate = null, endDate = null) {
  try {
    let url = BASE_URL;

    // Add date range parameters if provided
    if (startDate && endDate) {
      url = `${BASE_URL}?txtFECHAINI=${startDate}&txtFECHAFIN=${endDate}&CP=&LISTADO=SI`;
    }

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const records = [];

    // Find tables with price data
    $('table tr').each((index, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 4) {
        const fecha = $(cells[0]).text().trim();
        const cabezas = $(cells[1]).text().trim();
        const importe = $(cells[2]).text().trim();
        const inmag = $(cells[3]).text().trim();

        // Skip header rows, empty rows, TOTAL row, and invalid data
        const inmagValue = parseNumber(inmag);
        const cabezasValue = parseNumber(cabezas);

        // Validate: valid date, reasonable INMAG (100-50000), reasonable cabezas (>0, <500000)
        if (isValidDate(fecha) &&
            !fecha.includes('TOTAL') &&
            !fecha.toLowerCase().includes('totales') &&
            inmagValue > 100 && inmagValue < 50000 &&
            cabezasValue > 0 && cabezasValue < 500000) {
          records.push({
            fecha: parseDate(fecha),
            cabezas: cabezasValue,
            importe: parseNumber(importe),
            inmag: inmagValue
          });
        }
      }
    });

    console.log(`Scraped ${records.length} records from ${url}`);
    return records;

  } catch (error) {
    console.error('Scraper error:', error.message);
    return [];
  }
}

// Scrape a specific month (month is 1-12)
async function scrapeMonth(year, month) {
  const startDate = `01/${String(month).padStart(2, '0')}/${year}`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${lastDay}/${String(month).padStart(2, '0')}/${year}`;

  console.log(`Scraping ${month}/${year}: ${startDate} to ${endDate}`);
  return scrapePrices(startDate, endDate);
}

// Validate that string contains a valid DD/MM/YYYY date
// Handles formats like "Ma 02/12/2025" (day abbreviation + date)
function isValidDate(dateStr) {
  if (!dateStr) return false;

  // Look for DD/MM/YYYY pattern anywhere in the string
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return false;

  const [, day, month, year] = match;
  const d = parseInt(day), m = parseInt(month), y = parseInt(year);

  // Validate ranges
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (y < 2020 || y > 2030) return false;

  return true;
}

function parseDate(dateStr) {
  // Handle various date formats from the site
  const cleaned = dateStr.replace(/\s+/g, ' ').trim();

  // Try DD/MM/YYYY format
  const match = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return cleaned;
}

function parseNumber(numStr) {
  if (!numStr) return 0;
  // Remove dots as thousand separators, replace comma with decimal point
  const cleaned = numStr.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

module.exports = { scrapePrices, scrapeMonth, parseDate, parseNumber, isValidDate };
