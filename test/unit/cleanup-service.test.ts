import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanupRetention } from '../../src/services/cleanup-service';

test('deletes old runs and non-current snapshots according to retention', async () => {
  const calls: Array<[string, number]> = [];

  const result = await cleanupRetention({
    snapshotRepository: {
      async cleanupOldRuns(retentionDays: number) {
        calls.push(['runs', retentionDays]);
        return 7;
      },
      async cleanupOldSnapshots(retentionDays: number) {
        calls.push(['snapshots', retentionDays]);
        return 3;
      },
      async cleanupOldQueryTraces(retentionDays: number) {
        calls.push(['query_traces', retentionDays]);
        return 12;
      }
    } as never
  }, {
    scrapeRunRetentionDays: 180,
    snapshotRetentionDays: 365,
    queryTraceRetentionDays: 90
  });

  assert.deepEqual(calls, [
    ['runs', 180],
    ['snapshots', 365],
    ['query_traces', 90]
  ]);
  assert.deepEqual(result, {
    deletedRuns: 7,
    deletedSnapshots: 3,
    deletedQueryTraces: 12
  });
});
