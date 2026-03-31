import type { HolidayRecord } from '../types';
import type { RedisConnection } from '../types';

interface SnapshotMeta {
  source: 'redis';
  snapshot_id: string;
  updated_at: string;
}

interface NormalizedPayload {
  year: number;
  holidays: HolidayRecord[];
}

interface CacheServiceOptions {
  ttlSeconds: number;
}

export function createCacheService(redisClient: RedisConnection | null, options: CacheServiceOptions) {
  if (!redisClient) {
    return null;
  }

  const client = redisClient;
  const ttlSeconds = options.ttlSeconds;

  async function refreshCurrentSnapshot(payload: NormalizedPayload, metadata: SnapshotMeta): Promise<void> {
    const pipeline = client.multi();

    pipeline.set('holidays:all', JSON.stringify({
      data: payload.holidays,
      meta: metadata
    }), {
      EX: ttlSeconds
    });

    pipeline.set(`holidays:year:${payload.year}`, JSON.stringify({
      data: payload.holidays,
      meta: metadata
    }), {
      EX: ttlSeconds
    });

    for (const holiday of payload.holidays) {
      pipeline.set(`holidays:date:${holiday.date}`, JSON.stringify({
        data: {
          date: holiday.date,
          is_holiday: true,
          holiday: {
            name: holiday.name,
            scope: holiday.scope
          }
        },
        meta: metadata
      }), {
        EX: ttlSeconds
      });
    }

    pipeline.set('holidays:meta:current', JSON.stringify({
      data: {
        total_holidays: payload.holidays.length
      },
      meta: metadata
    }), {
      EX: ttlSeconds
    });

    await pipeline.exec();
  }

  async function ping(): Promise<void> {
    await client.ping();
  }

  return {
    ping,
    refreshCurrentSnapshot
  };
}
