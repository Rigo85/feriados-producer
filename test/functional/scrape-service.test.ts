import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { runScrape } from '../../src/services/scrape-service';

test('documents the expected blocked response shape', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    status: 418,
    text: async () => '<html>The access is blocked.</html>'
  } as Response);

  try {
    const result = await runScrape({
      sourceUrl: 'https://www.gob.pe/feriados',
      timeoutMs: 5000,
      maxRetries: 1,
      usePlaywrightFallback: false
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'FETCH_BLOCKED');
  } finally {
    global.fetch = originalFetch;
  }
});

test('uses browser fallback when the origin is blocked and fallback is enabled', async () => {
  const originalFetch = global.fetch;
  const fixtureHtml = fs.readFileSync(
    path.join(__dirname, '../fixtures/gob.pe-holidays-2026.html'),
    'utf8'
  );

  global.fetch = async () => ({
    status: 418,
    text: async () => '<html>The access is blocked.</html>'
  } as Response);

  try {
    let browserFallbackCalls = 0;

    const result = await runScrape({
      sourceUrl: 'https://www.gob.pe/feriados',
      timeoutMs: 5000,
      maxRetries: 1,
      usePlaywrightFallback: true,
      browserFetch: async () => {
        browserFallbackCalls += 1;
        return fixtureHtml;
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.usedBrowserFallback, true);
    assert.equal(browserFallbackCalls, 1);
    assert.equal(result.normalizedPayload.holidays.length, 15);
    assert.equal(result.parsed.diagnostics.selectedUpcomingMode, 'desktop');
  } finally {
    global.fetch = originalFetch;
  }
});
