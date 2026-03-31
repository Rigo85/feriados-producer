import 'dotenv/config';

import { loadEnv } from '../src/config/env';
import { createPostgresPool } from '../src/db/postgres';
import { createRedisConnection } from '../src/db/redis';
import { buildLogger } from '../src/logger';
import { createSnapshotRepository } from '../src/repositories/snapshot-repository';
import { createCacheService } from '../src/services/cache-service';
import { createProducerWorker } from '../src/workers/producer-worker';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = buildLogger(env);
  const postgresPool = createPostgresPool(env);
  const redisClient = await createRedisConnection(env, logger);
  const snapshotRepository = createSnapshotRepository(postgresPool);
  const cacheService = createCacheService(redisClient, {
    ttlSeconds: env.redisCacheTtlSeconds
  });
  const worker = createProducerWorker({
    env,
    logger,
    snapshotRepository,
    cacheService
  });

  const result = await worker.execute('manual');

  if (redisClient) {
    await redisClient.quit();
  }

  if (postgresPool) {
    await postgresPool.end();
  }

  process.stdout.write(`${JSON.stringify({
    ok: result.ok,
    usedBrowserFallback: result.usedBrowserFallback,
    statusCode: result.statusCode,
    holidayCount: result.ok ? result.normalizedPayload.holidays.length : 0,
    sync: result.ok ? (result.sync || null) : null
  }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
