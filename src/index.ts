import { loadEnv } from './config/env';
import { createPostgresPool } from './db/postgres';
import { createRedisConnection } from './db/redis';
import { buildLogger } from './logger';
import { createSnapshotRepository } from './repositories/snapshot-repository';
import { createCacheService } from './services/cache-service';
import { createProducerWorker } from './workers/producer-worker';

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

  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ signal }, 'producer shutdown started');

    await worker.stop();

    if (redisClient) {
      await redisClient.quit().catch((error: unknown) => {
        logger.error({ err: error }, 'failed to close producer redis client');
      });
    }

    if (postgresPool) {
      await postgresPool.end().catch((error: unknown) => {
        logger.error({ err: error }, 'failed to close producer postgres pool');
      });
    }

    logger.info({ signal }, 'producer shutdown completed');
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  worker.start();
  await worker.execute('boot');
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
