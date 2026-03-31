import type { Pool } from 'pg';

import { withTransaction } from '../db/postgres';
import type {
  CurrentSnapshotRow,
  HolidayRecord,
  PersistedSnapshot,
  RunRow
} from '../types';

interface SnapshotInput {
  sourceUrl: string;
  parserVersion: string;
  contentHash: string;
  normalizedHash: string;
  rawHtml: string;
  normalizedPayload: {
    year: number;
    holidays: HolidayRecord[];
  };
  holidays: HolidayRecord[];
}

export function createSnapshotRepository(pool: Pool | null) {
  if (!pool) {
    return null;
  }

  const db = pool;

  async function ping(): Promise<void> {
    await db.query('SELECT 1');
  }

  async function tryAcquireLock(lockKey: number): Promise<boolean> {
    const result = await db.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [lockKey]);
    return result.rows[0]?.locked === true;
  }

  async function releaseLock(lockKey: number): Promise<void> {
    await db.query('SELECT pg_advisory_unlock($1)', [lockKey]);
  }

  async function getCurrentSnapshot(): Promise<CurrentSnapshotRow | null> {
    const result = await db.query<CurrentSnapshotRow>(`
      SELECT id, normalized_hash, content_hash, fetched_at, record_count
      FROM holiday_snapshots
      WHERE is_current = TRUE
      LIMIT 1
    `);

    return result.rows[0] || null;
  }

  async function insertRunStart(trigger: string): Promise<RunRow> {
    const result = await db.query<RunRow>(`
      INSERT INTO scrape_runs (trigger, status)
      VALUES ($1, 'running')
      RETURNING id, started_at
    `, [trigger]);

    return result.rows[0]!;
  }

  interface FinishRunFields {
    status: string;
    httpStatus?: number;
    usedBrowserFallback?: boolean;
    changed?: boolean;
    errorCode?: string;
    errorMessage?: string;
    snapshotId?: string;
  }

  async function finishRun(runId: string, fields: FinishRunFields): Promise<void> {
    await db.query(`
      UPDATE scrape_runs
      SET finished_at = NOW(),
          status = $2,
          http_status = $3,
          used_browser_fallback = $4,
          changed = $5,
          error_code = $6,
          error_message = $7,
          snapshot_id = $8
      WHERE id = $1
    `, [
      runId,
      fields.status,
      fields.httpStatus || null,
      Boolean(fields.usedBrowserFallback),
      Boolean(fields.changed),
      fields.errorCode || null,
      fields.errorMessage || null,
      fields.snapshotId || null
    ]);
  }

  async function replaceCurrentSnapshot(snapshot: SnapshotInput): Promise<PersistedSnapshot> {
    return withTransaction(db, async (client) => {
      await client.query('UPDATE holiday_snapshots SET is_current = FALSE WHERE is_current = TRUE');

      const snapshotResult = await client.query<{ id: string; fetched_at: string }>(`
        INSERT INTO holiday_snapshots (
          source_url,
          content_hash,
          normalized_hash,
          parser_version,
          record_count,
          raw_html,
          normalized_payload,
          is_current
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, TRUE)
        RETURNING id, fetched_at
      `, [
        snapshot.sourceUrl,
        snapshot.contentHash,
        snapshot.normalizedHash,
        snapshot.parserVersion,
        snapshot.holidays.length,
        snapshot.rawHtml,
        JSON.stringify(snapshot.normalizedPayload)
      ]);

      const insertedSnapshot = snapshotResult.rows[0]!;
      const snapshotId = insertedSnapshot.id;

      for (const holiday of snapshot.holidays) {
        await client.query(`
          INSERT INTO holiday_snapshot_items (
            snapshot_id,
            holiday_date,
            year,
            month,
            day,
            name,
            scope
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          snapshotId,
          holiday.date,
          holiday.year,
          holiday.month,
          holiday.day,
          holiday.name,
          holiday.scope
        ]);
      }

      await client.query('DELETE FROM holidays_current');

      for (const holiday of snapshot.holidays) {
        await client.query(`
          INSERT INTO holidays_current (
            holiday_date,
            year,
            month,
            day,
            name,
            scope,
            snapshot_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          holiday.date,
          holiday.year,
          holiday.month,
          holiday.day,
          holiday.name,
          holiday.scope,
          snapshotId
        ]);
      }

      return {
        snapshotId,
        fetchedAt: insertedSnapshot.fetched_at
      };
    });
  }

  async function cleanupOldRuns(retentionDays: number): Promise<number> {
    const result = await db.query(`
      DELETE FROM scrape_runs
      WHERE finished_at IS NOT NULL
        AND finished_at < NOW() - make_interval(days => $1::integer)
    `, [retentionDays]);

    return result.rowCount || 0;
  }

  async function cleanupOldSnapshots(retentionDays: number): Promise<number> {
    const result = await db.query(`
      DELETE FROM holiday_snapshots
      WHERE is_current = FALSE
        AND fetched_at < NOW() - make_interval(days => $1::integer)
    `, [retentionDays]);

    return result.rowCount || 0;
  }

  async function cleanupOldQueryTraces(retentionDays: number): Promise<number> {
    const result = await db.query(`
      DELETE FROM query_traces
      WHERE created_at < NOW() - make_interval(days => $1::integer)
    `, [retentionDays]);

    return result.rowCount || 0;
  }

  return {
    cleanupOldQueryTraces,
    cleanupOldRuns,
    cleanupOldSnapshots,
    finishRun,
    getCurrentSnapshot,
    insertRunStart,
    ping,
    releaseLock,
    replaceCurrentSnapshot,
    tryAcquireLock
  };
}
