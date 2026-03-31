import { Pool, type PoolClient } from 'pg';

import type { EnvConfig } from '../types';

export function createPostgresPool(options: EnvConfig): Pool | null {
  if (!options.databaseUrl) {
    return null;
  }

  return new Pool({
    connectionString: options.databaseUrl,
    max: 5
  });
}

export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
