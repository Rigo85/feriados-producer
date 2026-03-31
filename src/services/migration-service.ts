import fs from 'node:fs';
import path from 'node:path';

import type { Pool } from 'pg';
import { withTransaction } from '../db/postgres';

interface AppliedMigrationRow {
  filename: string;
}

export async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function listAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query<AppliedMigrationRow>('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((row) => row.filename));
}

export function getMigrationFiles(sqlDirectory: string): string[] {
  return fs
    .readdirSync(sqlDirectory)
    .filter((filename) => filename.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
}

export async function applyPendingMigrations(pool: Pool, sqlDirectory: string): Promise<string[]> {
  await ensureMigrationsTable(pool);
  const applied = await listAppliedMigrations(pool);
  const files = getMigrationFiles(sqlDirectory);
  const appliedNow: string[] = [];

  for (const filename of files) {
    if (applied.has(filename)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(sqlDirectory, filename), 'utf8');
    await withTransaction(pool, async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    });
    appliedNow.push(filename);
  }

  return appliedNow;
}
