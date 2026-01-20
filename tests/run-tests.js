const { parseDate, parseNumber } = require('../src/scraper');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}`);
  }
}

// Scraper tests
console.log('\n--- Scraper Tests ---\n');

test('parseDate handles DD/MM/YYYY format', () => {
  assertEqual(parseDate('20/01/2026'), '2026-01-20');
});

test('parseDate handles single digit day/month', () => {
  assertEqual(parseDate('5/3/2026'), '2026-03-05');
});

test('parseDate returns original string if no match', () => {
  assertEqual(parseDate('invalid'), 'invalid');
});

test('parseNumber handles integers', () => {
  assertEqual(parseNumber('8032'), 8032);
});

test('parseNumber handles thousands with dots', () => {
  assertEqual(parseNumber('1.234.567'), 1234567);
});

test('parseNumber handles decimals with comma', () => {
  assertEqual(parseNumber('1.234,56'), 1234.56);
});

test('parseNumber returns 0 for invalid input', () => {
  assertEqual(parseNumber('abc'), 0);
});

test('parseNumber handles null/undefined', () => {
  assertEqual(parseNumber(null), 0);
  assertEqual(parseNumber(undefined), 0);
});

// Database tests
console.log('\n--- Database Tests ---\n');

// Use a test database
const testDbPath = path.join(__dirname, 'test-prices.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

// Temporarily override DB path
process.env.TEST_DB = testDbPath;

test('Database initializes without error', () => {
  // Just check the module loads
  const db = require('../src/database');
  assertEqual(typeof db.getDb, 'function');
  assertEqual(typeof db.insertRecord, 'function');
  assertEqual(typeof db.getLatest, 'function');
});

// Cleanup
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

// Summary
console.log('\n--- Results ---\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.log('\nTests failed!');
  process.exit(1);
} else {
  console.log('\nAll tests passed!');
  process.exit(0);
}
