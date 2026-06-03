import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../utils/errors.js';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

export class JobStore {
  constructor(filePath = path.resolve(process.cwd(), 'data', 'jobs.json')) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
  }

  async initialize() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify({ jobs: [] }, null, 2));
    }
  }

  async create({ type, payload, requestedBy, requestId, idempotencyKey }) {
    return this.withLock(async () => {
      const state = await this.read();
      if (idempotencyKey) {
        const existing = state.jobs.find((job) => job.idempotencyKey === idempotencyKey);
        if (existing) {
          return { job: existing, created: false };
        }
      }

      const now = new Date().toISOString();
      const job = {
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

  async get(id) {
    const state = await this.read();
    const job = state.jobs.find((entry) => entry.id === id);
    if (!job) {
      throw new AppError(404, 'job_not_found', `Job not found: ${id}`);
    }
    return job;
  }

  async markRunning(id) {
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

  async markSucceeded(id, result) {
    return this.update(id, (job) => ({
      ...job,
      status: 'succeeded',
      result,
      error: null,
      completedAt: new Date().toISOString()
    }));
  }

  async markFailed(id, error) {
    return this.update(id, (job) => ({
      ...job,
      status: 'failed',
      error: {
        code: error.code || 'job_failed',
        message: error.message || 'Job failed'
      },
      completedAt: new Date().toISOString()
    }));
  }

  async dependencyStatus() {
    try {
      await this.read();
      return { status: 'ok' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async update(id, updater) {
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

  async read() {
    const text = await fs.readFile(this.filePath, 'utf-8');
    return JSON.parse(text);
  }

  async write(state) {
    await fs.writeFile(this.filePath, JSON.stringify(state, null, 2));
  }

  async withLock(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }
}
