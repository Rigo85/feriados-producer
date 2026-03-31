import 'dotenv/config';

import path from 'node:path';

import { loadEnv } from '../src/config/env';
import { createPostgresPool } from '../src/db/postgres';
import { applyPendingMigrations, listAppliedMigrations } from '../src/services/migration-service';

async function main(): Promise<void> {
  const env = loadEnv();
  const pool = createPostgresPool(env);

  if (!pool) {
    throw new Error('DATABASE_URL is required');
  }

  const sqlDirectory = path.resolve(process.cwd(), 'sql');
  const appliedNow = await applyPendingMigrations(pool, sqlDirectory);
  const appliedTotal = await listAppliedMigrations(pool);

  process.stdout.write(`${JSON.stringify({
    applied_now: appliedNow,
    applied_total: Array.from(appliedTotal).sort()
  }, null, 2)}\n`);
  await pool.end();
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
