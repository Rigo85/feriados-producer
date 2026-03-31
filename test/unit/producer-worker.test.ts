import test from 'node:test';
import assert from 'node:assert/strict';

import { createProducerWorker } from '../../src/workers/producer-worker';

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

const baseEnv = {
  nodeEnv: 'test',
  logLevel: 'silent',
  producerCron: '0 0 */12 * * *',
  timezone: 'America/Lima',
  holidaysSourceUrl: 'https://www.gob.pe/feriados',
  httpTimeoutMs: 5000,
  httpMaxRetries: 1,
  usePlaywrightFallback: true,
  parserVersion: '2026-03-31.1',
  snapshotRetentionDays: 365,
  scrapeRunRetentionDays: 180,
  queryTraceRetentionDays: 90,
  redisCacheTtlSeconds: 172800,
  databaseUrl: '',
  redisUrl: ''
} as const;

test('audits blocked scrapes before persistence', async () => {
  const calls: string[] = [];

  const worker = createProducerWorker({
    env: baseEnv,
    logger: createLogger() as never,
    snapshotRepository: {
      async insertRunStart() {
        calls.push('insertRunStart');
        return { id: '1', started_at: '2026-03-31T15:00:00.000Z' };
      },
      async finishRun(_runId: string, fields: { errorCode?: string; status: string }) {
        calls.push(`finishRun:${fields.status}:${fields.errorCode || 'none'}`);
      }
    } as never,
    cacheService: null as never,
    runScrapeFn: async () => ({
      ok: false,
      usedBrowserFallback: false,
      statusCode: 418,
      errorCode: 'FETCH_BLOCKED',
      html: '<html>blocked</html>'
    })
  });

  const result = await worker.execute('manual');

  assert.equal(result.ok, false);
  assert.deepEqual(calls, [
    'insertRunStart',
    'finishRun:error:FETCH_BLOCKED'
  ]);
});

test('audits scrape exceptions as run errors', async () => {
  const calls: string[] = [];

  const worker = createProducerWorker({
    env: baseEnv,
    logger: createLogger() as never,
    snapshotRepository: {
      async insertRunStart() {
        calls.push('insertRunStart');
        return { id: '1', started_at: '2026-03-31T15:00:00.000Z' };
      },
      async finishRun(_runId: string, fields: { errorCode?: string; status: string }) {
        calls.push(`finishRun:${fields.status}:${fields.errorCode || 'none'}`);
      }
    } as never,
    cacheService: null as never,
    runScrapeFn: async () => {
      throw new Error('network timeout');
    }
  });

  await assert.rejects(() => worker.execute('manual'), /network timeout/);
  assert.deepEqual(calls, [
    'insertRunStart',
    'finishRun:error:SCRAPE_ERROR'
  ]);
});
