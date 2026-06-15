import pg from 'pg';
import { loadConfig } from '../config.js';

const config = loadConfig();
let pool: pg.Pool | null = null;

const dbUrl = config.databaseUrl;

if (dbUrl && dbUrl !== 'your_database_url_here') {
  pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });
}

export async function query(text: string, params?: any[]) {
  if (!pool) {
    throw new Error('Database connection pool is not initialized. Provide DATABASE_URL.');
  }
  return pool.query(text, params);
}

export async function getClient() {
  if (!pool) {
    throw new Error('Database connection pool is not initialized. Provide DATABASE_URL.');
  }
  return pool.connect();
}

export async function closePool() {
  if (pool) {
    await pool.end();
  }
}

export function isDbConnected(): boolean {
  return pool !== null;
}
