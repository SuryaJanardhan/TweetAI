import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../utils/errors.js';

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
    const state = await this.read();
    const job = state.jobs.find((entry) => entry.id === id);
    if (!job) {
      throw new AppError(404, 'job_not_found', `Job not found: ${id}`);
    }
    return job;
  }

  async markRunning(id: string): Promise<JobRecord> {
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
    return this.update(id, (job) => ({
      ...job,
      status: 'succeeded',
      result,
      error: null,
      completedAt: new Date().toISOString()
    }));
  }

  async markFailed(id: string, error: unknown): Promise<JobRecord> {
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
}
