import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../utils/errors.js';
import { query, isDbConnected } from '../db/index.js';

const TERMINAL_STATUSES = new Set<JobStatus>(['succeeded', 'failed', 'canceled']);

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'delayed' | 'dead-lettered';
export interface JobRecord {
  id: string;
  type: string;
  status: JobStatus;
  idempotencyKey?: string;
  requestId: string;
  requestedBy: Record<string, unknown>;
  payload: unknown;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: unknown;
  error: { code: string; message: string } | null;
}

interface JobState {
  jobs: JobRecord[];
}

interface CreateJobInput {
  type: string;
  payload: unknown;
  requestedBy: Record<string, unknown>;
  requestId: string;
  idempotencyKey?: string;
}

export class JobStore {
  filePath: string;
  queue: Promise<unknown>;

  constructor(filePath = path.resolve(process.cwd(), 'data', 'jobs.json')) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
  }

  async initialize(): Promise<void> {
    if (isDbConnected()) {
      return;
    }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify({ jobs: [] }, null, 2));
    }
  }

  async create({ type, payload, requestedBy, requestId, idempotencyKey }: CreateJobInput): Promise<{
    job: JobRecord;
    created: boolean;
  }> {
    if (isDbConnected()) {
      if (idempotencyKey) {
        const existing = await query('SELECT * FROM jobs WHERE idempotency_key = $1', [idempotencyKey]);
        if (existing.rows.length > 0) {
          return { job: this.mapRowToRecord(existing.rows[0]), created: false };
        }
      }

      const id = crypto.randomUUID();
      const now = new Date();
      try {
        const res = await query(
          `INSERT INTO jobs 
            (id, type, status, payload, requested_by, request_id, idempotency_key, created_at, updated_at, started_at, completed_at, attempts, result, error)
           VALUES 
            ($1, $2, 'queued', $3, $4, $5, $6, $7, $7, NULL, NULL, 0, NULL, NULL)
           RETURNING *`,
          [id, type, JSON.stringify(payload), JSON.stringify(requestedBy), requestId, idempotencyKey || null, now]
        );
        return { job: this.mapRowToRecord(res.rows[0]), created: true };
      } catch (err) {
        // Handle database uniqueness race conditions
        if (err && (err as any).code === '23505' && idempotencyKey) {
          const existing = await query('SELECT * FROM jobs WHERE idempotency_key = $1', [idempotencyKey]);
          return { job: this.mapRowToRecord(existing.rows[0]), created: false };
        }
        throw err;
      }
    }

    return this.withLock(async () => {
      const state = await this.read();
      if (idempotencyKey) {
        const existing = state.jobs.find((job) => job.idempotencyKey === idempotencyKey);
        if (existing) {
          return { job: existing, created: false };
        }
      }

      const now = new Date().toISOString();
      const job: JobRecord = {
        id: crypto.randomUUID(),
        type,
        status: 'queued',
        idempotencyKey,
        requestId,
        requestedBy,
        payload,
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
        result: null,
        error: null
      };

      state.jobs.push(job);
      await this.write(state);
      return { job, created: true };
    });
  }

  async get(id: string): Promise<JobRecord> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM jobs WHERE id = $1', [id]);
      if (res.rows.length === 0) {
        throw new AppError(404, 'job_not_found', `Job not found: ${id}`);
      }
      return this.mapRowToRecord(res.rows[0]);
    }

    const state = await this.read();
    const job = state.jobs.find((entry) => entry.id === id);
    if (!job) {
      throw new AppError(404, 'job_not_found', `Job not found: ${id}`);
    }
    return job;
  }

  async markRunning(id: string): Promise<JobRecord> {
    if (isDbConnected()) {
      const now = new Date();
      const res = await query(
        `UPDATE jobs 
         SET status = 'running', attempts = attempts + 1, started_at = COALESCE(started_at, $2), updated_at = $2
         WHERE id = $1 AND status NOT IN ('succeeded', 'failed', 'canceled')
         RETURNING *`,
        [id, now]
      );
      if (res.rows.length === 0) {
        return this.get(id);
      }
      return this.mapRowToRecord(res.rows[0]);
    }

    return this.update(id, (job) => {
      if (TERMINAL_STATUSES.has(job.status)) {
        return job;
      }
      return {
        ...job,
        status: 'running',
        attempts: job.attempts + 1,
        startedAt: job.startedAt || new Date().toISOString()
      };
    });
  }

  async markSucceeded(id: string, result: unknown): Promise<JobRecord> {
    if (isDbConnected()) {
      const now = new Date();
      const res = await query(
        `UPDATE jobs 
         SET status = 'succeeded', result = $2, error = NULL, completed_at = $3, updated_at = $3
         WHERE id = $1
         RETURNING *`,
        [id, JSON.stringify(result), now]
      );
      if (res.rows.length === 0) {
        throw new AppError(404, 'job_not_found', `Job not found: ${id}`);
      }
      return this.mapRowToRecord(res.rows[0]);
    }

    return this.update(id, (job) => ({
      ...job,
      status: 'succeeded',
      result,
      error: null,
      completedAt: new Date().toISOString()
    }));
  }

  async markFailed(id: string, error: unknown): Promise<JobRecord> {
    if (isDbConnected()) {
      const now = new Date();
      const normalizedError = error instanceof Error ? error : new Error('Job failed');
      const errObj = {
        code: error instanceof AppError ? error.code : 'job_failed',
        message: normalizedError.message
      };
      const res = await query(
        `UPDATE jobs 
         SET status = 'failed', error = $2, completed_at = $3, updated_at = $3
         WHERE id = $1
         RETURNING *`,
        [id, JSON.stringify(errObj), now]
      );
      if (res.rows.length === 0) {
        throw new AppError(404, 'job_not_found', `Job not found: ${id}`);
      }
      return this.mapRowToRecord(res.rows[0]);
    }

    const normalizedError = error instanceof Error ? error : new Error('Job failed');
    return this.update(id, (job) => ({
      ...job,
      status: 'failed',
      error: {
        code: error instanceof AppError ? error.code : 'job_failed',
        message: normalizedError.message
      },
      completedAt: new Date().toISOString()
    }));
  }

  async dependencyStatus(): Promise<{ status: 'ok' } | { status: 'error'; message: string }> {
    if (isDbConnected()) {
      try {
        await query('SELECT 1');
        return { status: 'ok' };
      } catch (error) {
        return { status: 'error', message: error instanceof Error ? error.message : 'Database query test failed' };
      }
    }

    try {
      await this.read();
      return { status: 'ok' };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : 'Unknown dependency error' };
    }
  }

  async update(id: string, updater: (job: JobRecord) => JobRecord): Promise<JobRecord> {
    return this.withLock(async () => {
      const state = await this.read();
      const index = state.jobs.findIndex((job) => job.id === id);
      if (index === -1) {
        throw new AppError(404, 'job_not_found', `Job not found: ${id}`);
      }

      const updated = {
        ...updater(state.jobs[index]),
        updatedAt: new Date().toISOString()
      };
      state.jobs[index] = updated;
      await this.write(state);
      return updated;
    });
  }

  async read(): Promise<JobState> {
    const text = await fs.readFile(this.filePath, 'utf-8');
    return JSON.parse(text) as JobState;
  }

  async write(state: JobState): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(state, null, 2));
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  private mapRowToRecord(row: any): JobRecord {
    return {
      id: row.id,
      type: row.type,
      status: row.status as JobStatus,
      idempotencyKey: row.idempotency_key || undefined,
      requestId: row.request_id,
      requestedBy: row.requested_by,
      payload: row.payload,
      attempts: row.attempts,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      result: row.result,
      error: row.error
    };
  }
}
