const { test } = require('node:test');
const assert = require('node:assert');
const { readFileSync, existsSync } = require('node:fs');
const { join, dirname } = require('node:path');

const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));
const files = pkg.files || [];

test('all files in package.json files array must exist on disk', () => {
  const missing = [];
  for (const f of files) {
    const fullPath = join(__dirname, f);
    if (!existsSync(fullPath)) {
      missing.push(f);
    }
  }
  assert.equal(missing.length, 0, `Files not found on disk: ${missing.join(', ')}`);
});
