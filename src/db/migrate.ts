import { query, isDbConnected } from './index.js';

export async function runMigrations() {
  if (!isDbConnected()) {
    // eslint-disable-next-line no-console
    console.log('[DB Migration] Database not connected. Skipping migrations.');
    return;
  }

  // eslint-disable-next-line no-console
  console.log('[DB Migration] Running migrations...');

  await query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id VARCHAR(255) PRIMARY KEY,
      type VARCHAR(100) NOT NULL,
      status VARCHAR(50) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      result JSONB,
      error JSONB,
      attempts INTEGER DEFAULT 0,
      idempotency_key VARCHAR(255) UNIQUE,
      request_id VARCHAR(255),
      requested_by JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL,
      started_at TIMESTAMP,
      completed_at TIMESTAMP
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS memory (
      id SERIAL PRIMARY KEY,
      type VARCHAR(100) NOT NULL,
      entry JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255),
      action VARCHAR(255) NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // eslint-disable-next-line no-console
  console.log('[DB Migration] Migrations finished successfully.');
}
