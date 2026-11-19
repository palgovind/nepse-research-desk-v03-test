const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('v0.3 uses a dedicated localStorage key, not the v0.2 production key', () => {
  assert.match(app, /const DB_KEY = "nepse_research_desk_v03_test"/);
  assert.doesNotMatch(app, /const DB_KEY = "nepse_research_desk_v1"/);
});

test('service worker cache cleanup is restricted to the v0.3 test namespace', () => {
  assert.match(sw, /const CACHE_PREFIX="nepse-research-desk-v03-test-"/);
  assert.match(sw, /k\.startsWith\(CACHE_PREFIX\)&&k!==CACHE/);
  assert.doesNotMatch(sw, /keys\.filter\(k=>k!==CACHE\)/);
});
