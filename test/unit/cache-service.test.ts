import test from 'node:test';
import assert from 'node:assert/strict';

import { createCacheService } from '../../src/services/cache-service';

test('writes the current snapshot to Redis through a single pipeline with TTL', async () => {
  const calls: Array<[string, string, { EX: number }]> = [];
  let execCalled = 0;

  const redisClient = {
    multi() {
      return {
        set(key: string, value: string, options: { EX: number }) {
          calls.push([key, value, options]);
          return this;
        },
        async exec() {
          execCalled += 1;
        }
      };
    },
    async ping() {}
  };

  const cacheService = createCacheService(redisClient as never, {
    ttlSeconds: 172800
  });

  await cacheService!.refreshCurrentSnapshot({
    year: 2026,
    holidays: [
      {
        date: '2026-07-28',
        year: 2026,
        month: 7,
        day: 28,
        name: 'Fiestas Patrias',
        scope: 'national'
      },
      {
        date: '2026-07-29',
        year: 2026,
        month: 7,
        day: 29,
        name: 'Fiestas Patrias',
        scope: 'national'
      }
    ]
  }, {
    source: 'redis',
    snapshot_id: '1',
    updated_at: '2026-03-31T15:00:00.000Z'
  });

  assert.equal(execCalled, 1);
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.map(([key]) => key), [
    'holidays:all',
    'holidays:year:2026',
    'holidays:date:2026-07-28',
    'holidays:date:2026-07-29',
    'holidays:meta:current'
  ]);
  for (const [, , options] of calls) {
    assert.equal(options.EX, 172800);
  }
});
