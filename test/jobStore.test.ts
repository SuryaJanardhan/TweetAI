import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { JobStore } from '../src/jobs/JobStore.js';
import { JobRunner } from '../src/jobs/JobRunner.js';
import { cleanupTestStorage, closeTestConnections } from '../src/utils/testHelpers.js';

function isolatedJobPath(name: string): string {
  return path.resolve(process.cwd(), 'data', `${name}-${crypto.randomUUID()}`, 'jobs.json');
}

beforeEach(async () => {
  await cleanupTestStorage();
});

after(async () => {
  await closeTestConnections();
});

test('JobStore reuses existing jobs for the same idempotency key', async () => {
  const jobStore = new JobStore(isolatedJobPath('job-store-test'));
  await jobStore.initialize();

  const first = await jobStore.create({
    type: 'orchestration',
    payload: { topic: 'nodejs' },
    requestedBy: { role: 'editor' },
    requestId: 'req-1',
    idempotencyKey: 'same-key-123'
  });

  const second = await jobStore.create({
    type: 'orchestration',
    payload: { topic: 'nodejs' },
    requestedBy: { role: 'editor' },
    requestId: 'req-2',
    idempotencyKey: 'same-key-123'
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.job.id, first.job.id);
});

test('JobRunner marks orchestration jobs as succeeded', async () => {
  const jobStore = new JobStore(isolatedJobPath('job-runner-test'));
  await jobStore.initialize();
  const { job } = await jobStore.create({
    type: 'orchestration',
    payload: { topic: 'nodejs' },
    requestedBy: { role: 'editor' },
    requestId: 'req-1'
  });

  const logger = { info: async () => {}, error: async () => {} };
  const orchestrator = {
    loop: async (payload: unknown) => ({ ok: true, payload })
  };
  const runner = new JobRunner({ jobStore, orchestrator, logger });
  await runner.run(job.id);

  const stored = await jobStore.get(job.id);
  assert.equal(stored.status, 'succeeded');
  assert.deepEqual(stored.result, { ok: true, payload: { topic: 'nodejs' } });

  await runner.shutdown();
});
