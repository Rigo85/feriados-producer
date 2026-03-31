import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { applyPendingMigrations } from '../../src/services/migration-service';

test('applies each pending migration inside a single client transaction', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feriados-migrations-'));
  fs.writeFileSync(path.join(tempDir, '001_test.sql'), 'SELECT 1;');

  const clientCalls: string[] = [];
  const client = {
    async query(sql: string, params?: unknown[]) {
      clientCalls.push(params?.length ? `${sql}:${String(params[0])}` : sql);
      if (sql.includes('SELECT filename FROM schema_migrations')) {
        return {
          rows: []
        };
      }
      return {
        rows: [],
        rowCount: 1
      };
    },
    release() {}
  };

  const pool = {
    async query(sql: string) {
      if (sql.includes('SELECT filename FROM schema_migrations')) {
        return {
          rows: []
        };
      }

      if (sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) {
        return {
          rows: [],
          rowCount: 0
        };
      }

      throw new Error(`unexpected pool query: ${sql}`);
    },
    async connect() {
      return client;
    }
  };

  const applied = await applyPendingMigrations(pool as never, tempDir);

  assert.deepEqual(applied, ['001_test.sql']);
  assert.deepEqual(clientCalls, [
    'BEGIN',
    'SELECT 1;',
    'INSERT INTO schema_migrations (filename) VALUES ($1):001_test.sql',
    'COMMIT'
  ]);
});
