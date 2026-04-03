import { createClient } from 'redis';

export interface EnvConfig {
  nodeEnv: string;
  logLevel: string;
  producerCron: string;
  timezone: string;
  holidaysSourceUrl: string;
  httpTimeoutMs: number;
  httpMaxRetries: number;
  usePlaywrightFallback: boolean;
  parserVersion: string;
  snapshotRetentionDays: number;
  scrapeRunRetentionDays: number;
  queryTraceRetentionDays: number;
  redisCacheTtlSeconds: number;
  maxAllowedMissingFutureHolidays: number;
  minObservedCoverageRatio: number;
  databaseUrl: string;
  redisUrl: string;
}

export interface HolidayRecord {
  date: string;
  year: number;
  month: number;
  day: number;
  name: string;
  scope: 'national';
}

export interface BaselineHolidayRecord extends HolidayRecord {
  notes: string | null;
  sourceLabel: string;
}

export interface ProjectedHolidayRecord extends HolidayRecord {
  sourceOfTruth: 'baseline' | 'gobpe';
}

export interface ParserDiagnostics {
  recentHolidayFound: boolean;
  desktopRowCount: number;
  mobileRowCount: number;
  selectedUpcomingMode: 'desktop' | 'mobile' | 'none';
  regionalEmptyStateDetected: boolean;
}

export interface ParsedHolidayPage {
  year: number;
  title: string;
  holidays: HolidayRecord[];
  diagnostics: ParserDiagnostics;
}

export interface ScrapeResultBlocked {
  ok: false;
  usedBrowserFallback: boolean;
  statusCode: number;
  errorCode: 'FETCH_BLOCKED';
  html: string;
}

export interface ScrapeResultSuccess {
  ok: true;
  usedBrowserFallback: boolean;
  statusCode: number;
  html: string;
  parsed: ParsedHolidayPage;
  contentHash: string;
  normalizedHash: string;
  normalizedPayload: {
    year: number;
    holidays: HolidayRecord[];
  };
  sync?: SyncSnapshotResult;
}

export type ScrapeResult = ScrapeResultBlocked | ScrapeResultSuccess;

export interface CurrentSnapshotRow {
  id: string;
  normalized_hash: string;
  content_hash: string;
  fetched_at: string;
  record_count: number;
}

export interface RunRow {
  id: string;
  started_at: string;
}

export interface PersistedSnapshot {
  snapshotId: string;
  fetchedAt: string;
}

export interface SyncSnapshotResult {
  changed: boolean;
  persisted: boolean;
  skipped?: boolean;
  rejected?: boolean;
  snapshotId?: string;
  projectedHolidayCount?: number;
  observedHolidayCount?: number;
  rejectionCode?: string;
  cleanup?: CleanupResult;
}

export type RedisConnection = ReturnType<typeof createClient>;

export interface CleanupResult {
  deletedRuns: number;
  deletedSnapshots: number;
  deletedQueryTraces: number;
}

export interface RunEvent {
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  holidayDate?: string;
  scope?: 'national';
  details?: Record<string, unknown>;
}

export interface ReconciliationResult {
  accepted: boolean;
  projectedHolidays: ProjectedHolidayRecord[];
  anchorDate: string | null;
  expectedRemainingCount: number;
  observedCount: number;
  missingFutureCount: number;
  coverageRatio: number;
  events: RunEvent[];
  rejectionCode?: string;
  rejectionMessage?: string;
}
