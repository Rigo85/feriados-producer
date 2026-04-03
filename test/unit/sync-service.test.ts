import test from 'node:test';
import assert from 'node:assert/strict';

import { syncSnapshot } from '../../src/services/sync-service';

function createScrapeResult() {
  return {
    ok: true as const,
    usedBrowserFallback: false,
    statusCode: 200,
    html: '<html></html>',
    parsed: {
      year: 2026,
      title: 'Feriados 2026',
      diagnostics: {
        recentHolidayFound: true,
        desktopRowCount: 1,
        mobileRowCount: 0,
        selectedUpcomingMode: 'desktop' as const,
        regionalEmptyStateDetected: false
      },
      holidays: [
        {
          date: '2026-07-28',
          year: 2026,
          month: 7,
          day: 28,
          name: 'Fiestas Patrias',
          scope: 'national' as const
        }
      ]
    },
    contentHash: 'content-hash',
    normalizedHash: 'normalized-hash',
    normalizedPayload: {
      year: 2026,
      holidays: [
        {
          date: '2026-07-28',
          year: 2026,
          month: 7,
          day: 28,
          name: 'Fiestas Patrias',
          scope: 'national' as const
        }
      ]
    }
  };
}

test('persists a new snapshot and refreshes cache when the normalized hash changes', async () => {
  const calls: string[] = [];

  const result = await syncSnapshot({
    snapshotRepository: {
      async tryAcquireLock() {
        calls.push('tryAcquireLock');
        return true;
      },
      async getCurrentSnapshot() {
        calls.push('getCurrentSnapshot');
        return {
          id: '9',
          normalized_hash: 'older-hash',
          content_hash: 'older-content',
          fetched_at: '2026-03-30T15:00:00.000Z',
          record_count: 14
        };
      },
      async getCurrentProjection() {
        calls.push('getCurrentProjection');
        return [];
      },
      async getBaselineHolidays() {
        calls.push('getBaselineHolidays');
        return [
          {
            date: '2026-01-01',
            year: 2026,
            month: 1,
            day: 1,
            name: 'Año Nuevo',
            scope: 'national' as const,
            notes: null,
            sourceLabel: 'seed_2026_table'
          },
          {
            date: '2026-07-28',
            year: 2026,
            month: 7,
            day: 28,
            name: 'Fiestas Patrias',
            scope: 'national' as const,
            notes: null,
            sourceLabel: 'seed_2026_table'
          }
        ];
      },
      async replaceCurrentSnapshot(input: { projectedHolidays: Array<{ sourceOfTruth: string }> }) {
        calls.push('replaceCurrentSnapshot');
        assert.equal(input.projectedHolidays.length, 2);
        return {
          snapshotId: '10',
          fetchedAt: '2026-03-31T15:00:00.000Z'
        };
      },
      async insertRunEvents() {
        calls.push('insertRunEvents');
      },
      async finishRun(_runId: string, fields: { changed?: boolean; snapshotId?: string; status: string }) {
        calls.push(`finishRun:${fields.status}:${String(fields.changed)}:${fields.snapshotId || 'none'}`);
      },
      async releaseLock() {
        calls.push('releaseLock');
      }
    } as never,
    cacheService: {
      async refreshCurrentSnapshot() {
        calls.push('refreshCurrentSnapshot');
      }
    } as never
  }, {
    runId: '1',
    sourceUrl: 'https://www.gob.pe/feriados',
    parserVersion: '2026-03-31.1',
    maxAllowedMissingFutureHolidays: 2,
    minObservedCoverageRatio: 0.75,
    scrapeResult: createScrapeResult()
  });

  assert.equal(result.changed, true);
  assert.equal(result.persisted, true);
  assert.equal(result.snapshotId, '10');
  assert.deepEqual(calls, [
    'tryAcquireLock',
    'getCurrentSnapshot',
    'getCurrentProjection',
    'getBaselineHolidays',
    'replaceCurrentSnapshot',
    'insertRunEvents',
    'refreshCurrentSnapshot',
    'finishRun:success:true:10',
    'releaseLock'
  ]);
});

test('skips persistence when the snapshot hash did not change', async () => {
  let refreshCalled = false;

  const result = await syncSnapshot({
    snapshotRepository: {
      async tryAcquireLock() {
        return true;
      },
      async getCurrentSnapshot() {
        return {
          id: '9',
          normalized_hash: 'normalized-hash',
          content_hash: 'content-hash',
          fetched_at: '2026-03-30T15:00:00.000Z',
          record_count: 15
        };
      },
      async getCurrentProjection() {
        return [
          {
            date: '2026-01-01',
            year: 2026,
            month: 1,
            day: 1,
            name: 'Año Nuevo',
            scope: 'national' as const
          },
          {
            date: '2026-07-28',
            year: 2026,
            month: 7,
            day: 28,
            name: 'Fiestas Patrias',
            scope: 'national' as const
          }
        ];
      },
      async getBaselineHolidays() {
        return [
          {
            date: '2026-01-01',
            year: 2026,
            month: 1,
            day: 1,
            name: 'Año Nuevo',
            scope: 'national' as const,
            notes: null,
            sourceLabel: 'seed_2026_table'
          },
          {
            date: '2026-07-28',
            year: 2026,
            month: 7,
            day: 28,
            name: 'Fiestas Patrias',
            scope: 'national' as const,
            notes: null,
            sourceLabel: 'seed_2026_table'
          }
        ];
      },
      async replaceCurrentSnapshot() {
        throw new Error('should not persist unchanged snapshot');
      },
      async insertRunEvents() {
        throw new Error('should not insert events for an unchanged snapshot');
      },
      async finishRun() {},
      async releaseLock() {}
    } as never,
    cacheService: {
      async refreshCurrentSnapshot() {
        refreshCalled = true;
      }
    } as never
  }, {
    runId: '1',
    sourceUrl: 'https://www.gob.pe/feriados',
    parserVersion: '2026-03-31.1',
    maxAllowedMissingFutureHolidays: 2,
    minObservedCoverageRatio: 0.75,
    scrapeResult: createScrapeResult()
  });

  assert.equal(result.changed, false);
  assert.equal(result.persisted, false);
  assert.equal(refreshCalled, true);
});

test('skips the run when the advisory lock cannot be acquired', async () => {
  let finishStatus = '';

  const result = await syncSnapshot({
    snapshotRepository: {
      async tryAcquireLock() {
        return false;
      },
      async getCurrentSnapshot() {
        throw new Error('should not query current snapshot without lock');
      },
      async getCurrentProjection() {
        throw new Error('should not query current projection without lock');
      },
      async getBaselineHolidays() {
        throw new Error('should not query baseline without lock');
      },
      async replaceCurrentSnapshot() {
        throw new Error('should not persist without lock');
      },
      async insertRunEvents() {
        throw new Error('should not persist events without lock');
      },
      async finishRun(_runId: string, fields: { status: string }) {
        finishStatus = fields.status;
      },
      async releaseLock() {
        throw new Error('should not release a lock that was never acquired');
      }
    } as never,
    cacheService: null as never
  }, {
    runId: '1',
    sourceUrl: 'https://www.gob.pe/feriados',
    parserVersion: '2026-03-31.1',
    maxAllowedMissingFutureHolidays: 2,
    minObservedCoverageRatio: 0.75,
    scrapeResult: createScrapeResult()
  });

  assert.equal(result.changed, false);
  assert.equal(result.persisted, false);
  assert.equal(result.skipped, true);
  assert.equal(finishStatus, 'skipped');
});
