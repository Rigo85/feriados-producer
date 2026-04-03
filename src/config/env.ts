import 'dotenv/config';

import type { EnvConfig } from '../types';

function getEnvNumber(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getEnvBoolean(name: string, fallback: boolean): boolean {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(rawValue).toLowerCase());
}

export function loadEnv(): EnvConfig {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    producerCron: process.env.PRODUCER_CRON || '0 0 */12 * * *',
    timezone: process.env.TIMEZONE || 'America/Lima',
    holidaysSourceUrl: process.env.HOLIDAYS_SOURCE_URL || 'https://www.gob.pe/feriados',
    httpTimeoutMs: getEnvNumber('HTTP_TIMEOUT_MS', 15000),
    httpMaxRetries: getEnvNumber('HTTP_MAX_RETRIES', 3),
    usePlaywrightFallback: getEnvBoolean('USE_PLAYWRIGHT_FALLBACK', true),
    parserVersion: process.env.PARSER_VERSION || 'dev',
    snapshotRetentionDays: getEnvNumber('SNAPSHOT_RETENTION_DAYS', 365),
    scrapeRunRetentionDays: getEnvNumber('SCRAPE_RUN_RETENTION_DAYS', 180),
    queryTraceRetentionDays: getEnvNumber('QUERY_TRACE_RETENTION_DAYS', 90),
    redisCacheTtlSeconds: getEnvNumber('REDIS_CACHE_TTL_SECONDS', 172800),
    maxAllowedMissingFutureHolidays: getEnvNumber('MAX_ALLOWED_MISSING_FUTURE_HOLIDAYS', 2),
    minObservedCoverageRatio: getEnvNumber('MIN_OBSERVED_COVERAGE_RATIO', 0.75),
    databaseUrl: process.env.DATABASE_URL || '',
    redisUrl: process.env.REDIS_URL || ''
  };
}
