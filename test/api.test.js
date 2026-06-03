import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { authenticateApiKey, requireRole } from '../src/middleware/auth.js';
import { optionalIdempotencyKey, requireMemoryType, requireObjectBody } from '../src/middleware/validation.js';

const config = {
  auth: {
    required: true,
    apiKeys: [
      { token: 'viewer-token', role: 'viewer' },
      { token: 'editor-token', role: 'editor' },
      { token: 'admin-token', role: 'admin' }
    ]
  }
};

function request({
  authorization,
  idempotencyKey,
  role,
  body = {},
  type = 'working',
  contentType = 'application/json'
} = {}) {
  return {
    body,
    params: { type },
    user: role ? { role } : undefined,
    header(name) {
      if (name.toLowerCase() === 'authorization') {
        return authorization;
      }
      if (name.toLowerCase() === 'idempotency-key') {
        return idempotencyKey;
      }
      return undefined;
    },
    is(value) {
      return value === contentType;
    }
  };
}

test('authenticateApiKey rejects missing credentials', () => {
  const middleware = authenticateApiKey(config);
  middleware(request(), {}, (error) => {
    assert.equal(error.statusCode, 401);
    assert.equal(error.code, 'unauthorized');
  });
});

test('createApp initializes with test configuration without binding a port', async () => {
  const { services } = await createApp({
    config: {
      nodeEnv: 'test',
      requestJsonLimit: '100kb',
      auth: config.auth,
      safety: { dryRun: true }
    }
  });

  assert.equal(services.config.nodeEnv, 'test');
  assert.ok(services.jobStore);
  assert.ok(services.jobRunner);
});

test('validation accepts safe idempotency keys and rejects unsafe keys', () => {
  const req = request({ idempotencyKey: 'orchestrate:topic-123' });
  optionalIdempotencyKey(req, {}, (error) => {
    assert.equal(error, undefined);
    assert.equal(req.idempotencyKey, 'orchestrate:topic-123');
  });

  optionalIdempotencyKey(request({ idempotencyKey: 'bad key!' }), {}, (error) => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'invalid_idempotency_key');
  });
});

test('authenticateApiKey attaches the configured role', () => {
  const req = request({ authorization: 'Bearer editor-token' });
  const middleware = authenticateApiKey(config);
  middleware(req, {}, (error) => {
    assert.equal(error, undefined);
    assert.deepEqual(req.user, { role: 'editor', authMode: 'api-key' });
  });
});

test('requireRole allows editor access and blocks viewer access', () => {
  requireRole('editor')(request({ role: 'editor' }), {}, (error) => {
    assert.equal(error, undefined);
  });

  requireRole('editor')(request({ role: 'viewer' }), {}, (error) => {
    assert.equal(error.statusCode, 403);
    assert.equal(error.details.requiredRole, 'editor');
  });
});

test('validation rejects invalid memory types and non-object bodies', () => {
  requireMemoryType(request({ type: 'unknown' }), {}, (error) => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'invalid_memory_type');
  });

  requireObjectBody(request({ body: [] }), {}, (error) => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'invalid_body');
  });
});
