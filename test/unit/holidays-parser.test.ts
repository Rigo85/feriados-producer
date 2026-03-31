import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { detectWafBlock, parseHolidayPage } from '../../src/parser/holidays-parser';

test('parses the current gob.pe markup shape into canonical holidays', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'gob.pe-holidays-2026.html'), 'utf8');
  const result = parseHolidayPage(html);

  assert.equal(result.year, 2026);
  assert.deepEqual(result.holidays, [
    {
      date: '2026-04-02',
      year: 2026,
      month: 4,
      day: 2,
      name: 'Semana Santa',
      scope: 'national'
    },
    {
      date: '2026-04-03',
      year: 2026,
      month: 4,
      day: 3,
      name: 'Semana Santa',
      scope: 'national'
    },
    {
      date: '2026-05-01',
      year: 2026,
      month: 5,
      day: 1,
      name: 'Día del Trabajo',
      scope: 'national'
    }
  ]);
});

test('detects a WAF response page', () => {
  assert.equal(detectWafBlock('<html><title>The access is blocked.</title></html>'), true);
});
