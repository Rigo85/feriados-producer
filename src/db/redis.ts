import { createClient } from 'redis';

import type { EnvConfig } from '../types';
import type { RedisConnection } from '../types';

interface RedisLogger {
  error(payload: unknown, message?: string): void;
}

export async function createRedisConnection(options: EnvConfig, logger?: RedisLogger): Promise<RedisConnection | null> {
  if (!options.redisUrl) {
    return null;
  }

  const client = createClient({
    url: options.redisUrl
  });

  client.on('error', (error: unknown) => {
    if (logger) {
      logger.error({ err: error }, 'redis client error');
      return;
    }

    process.stderr.write(`redis client error: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  });
  await client.connect();
  return client as RedisConnection;
}
