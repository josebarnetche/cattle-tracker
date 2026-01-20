const axios = require('axios');
const cheerio = require('cheerio');

const SOURCE_URL = 'https://www.mercadoagroganadero.com.ar/dll/hacienda2.dll/haciinfo000011';

async function scrapePrices() {
  try {
    const response = await axios.get(SOURCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
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

        // Skip header rows and empty rows
        if (fecha && !fecha.includes('Fecha') && /\d/.test(fecha)) {
          records.push({
            fecha: parseDate(fecha),
            cabezas: parseNumber(cabezas),
            importe: parseNumber(importe),
            inmag: parseNumber(inmag)
          });
        }
      }
    });

    console.log(`Scraped ${records.length} records from ${SOURCE_URL}`);
    return records;

  } catch (error) {
    console.error('Scraper error:', error.message);
    return [];
  }
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

module.exports = { scrapePrices, parseDate, parseNumber };
