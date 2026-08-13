import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function getPool() {
  const connectionString = import.meta.env.DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL non configurato');
  }
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 6,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

export async function query<T = any>(text: string, params: unknown[] = []) {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}
