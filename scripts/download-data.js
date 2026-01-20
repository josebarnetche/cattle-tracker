const fs = require('fs');
const path = require('path');
const { scrapeMonth } = require('../src/scraper');

async function downloadAllData() {
  const allRecords = [];

  // Download December 2025
  console.log('Downloading December 2025...');
  const dec2025 = await scrapeMonth(2025, 12);
  allRecords.push(...dec2025);
  console.log(`Got ${dec2025.length} records`);

  // Wait a bit between requests
  await new Promise(r => setTimeout(r, 1000));

  // Download January 2026
  console.log('Downloading January 2026...');
  const jan2026 = await scrapeMonth(2026, 1);
  allRecords.push(...jan2026);
  console.log(`Got ${jan2026.length} records`);

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

  // Print summary
  console.log('\n=== Summary ===');
  uniqueRecords.forEach(r => {
    console.log(`${r.fecha}: cabezas=${r.cabezas}, inmag=${r.inmag}`);
  });

  const avgInmag = uniqueRecords.reduce((sum, r) => sum + r.inmag, 0) / uniqueRecords.length;
  console.log(`\nOverall avg INMAG: ${avgInmag.toFixed(2)}`);
}

downloadAllData().catch(console.error);
