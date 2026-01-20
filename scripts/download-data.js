const fs = require('fs');
const path = require('path');
const { scrapeMonth } = require('../src/scraper');

async function downloadAllData() {
  const allRecords = [];

  // Download from July 2025 to January 2026 (7 months)
  const months = [
    { year: 2025, month: 7 },
    { year: 2025, month: 8 },
    { year: 2025, month: 9 },
    { year: 2025, month: 10 },
    { year: 2025, month: 11 },
    { year: 2025, month: 12 },
    { year: 2026, month: 1 },
  ];

  for (const { year, month } of months) {
    console.log(`Downloading ${month}/${year}...`);
    try {
      const records = await scrapeMonth(year, month);
      allRecords.push(...records);
      console.log(`  Got ${records.length} records`);
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
    // Wait between requests
    await new Promise(r => setTimeout(r, 1500));
  }

  // Sort by date
  allRecords.sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Remove duplicates by fecha
  const uniqueRecords = [];
  const seen = new Set();
  for (const r of allRecords) {
    if (!seen.has(r.fecha)) {
      seen.add(r.fecha);
      uniqueRecords.push(r);
    }
  }

  console.log(`\nTotal unique records: ${uniqueRecords.length}`);

  // Save to data/historical.json
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outputPath = path.join(dataDir, 'historical.json');
  fs.writeFileSync(outputPath, JSON.stringify(uniqueRecords, null, 2));
  console.log(`Saved to ${outputPath}`);

  // Print monthly summary
  console.log('\n=== Monthly Summary ===');
  const byMonth = {};
  for (const r of uniqueRecords) {
    const month = r.fecha.substring(0, 7);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(r);
  }

  for (const [month, records] of Object.entries(byMonth).sort()) {
    const avgInmag = records.reduce((s, r) => s + r.inmag, 0) / records.length;
    const minInmag = Math.min(...records.map(r => r.inmag));
    const maxInmag = Math.max(...records.map(r => r.inmag));
    console.log(`${month}: ${records.length} days, avg=${avgInmag.toFixed(2)}, min=${minInmag.toFixed(2)}, max=${maxInmag.toFixed(2)}`);
  }

  const overallAvg = uniqueRecords.reduce((s, r) => s + r.inmag, 0) / uniqueRecords.length;
  console.log(`\nOverall avg INMAG: ${overallAvg.toFixed(2)}`);
}

downloadAllData().catch(console.error);
