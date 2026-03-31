import 'dotenv/config';

import { loadEnv } from '../src/config/env';
import { createPostgresPool } from '../src/db/postgres';
import { cleanupRetention } from '../src/services/cleanup-service';
import { createSnapshotRepository } from '../src/repositories/snapshot-repository';

async function main(): Promise<void> {
  const env = loadEnv();
  const postgresPool = createPostgresPool(env);

  if (!postgresPool) {
    throw new Error('DATABASE_URL is required to run cleanup');
  }

  const snapshotRepository = createSnapshotRepository(postgresPool);

  if (!snapshotRepository) {
    throw new Error('Snapshot repository could not be initialized');
  }

  const result = await cleanupRetention({
    snapshotRepository
  }, {
    snapshotRetentionDays: env.snapshotRetentionDays,
    scrapeRunRetentionDays: env.scrapeRunRetentionDays,
    queryTraceRetentionDays: env.queryTraceRetentionDays
  });

  await postgresPool.end();

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
