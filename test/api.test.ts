import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { createApp } from '../src/app.js';
import { authenticateApiKey, requireRole } from '../src/middleware/auth.js';
import { optionalIdempotencyKey, requireMemoryType, requireObjectBody } from '../src/middleware/validation.js';
import type { AppConfig, Role } from '../src/types.js';

const config: AppConfig = {
  nodeEnv: 'test',
  requestJsonLimit: '100kb',
  auth: {
    required: true,
    apiKeys: [
      { token: 'viewer-token', role: 'viewer' },
      { token: 'editor-token', role: 'editor' },
      { token: 'admin-token', role: 'admin' }
    ]
  },
  safety: { dryRun: true }
};

interface RequestOptions {
  authorization?: string;
  idempotencyKey?: string;
  role?: Role;
  body?: unknown;
  type?: string;
  contentType?: string;
}

function request({
  authorization,
  idempotencyKey,
  role,
  body = {},
  type = 'working',
  contentType = 'application/json'
}: RequestOptions = {}): Request {
  return {
    body,
    params: { type },
    user: role ? { role } : undefined,
    header(name: string) {
      if (name.toLowerCase() === 'authorization') {
        return authorization;
      }
      if (name.toLowerCase() === 'idempotency-key') {
        return idempotencyKey;
      }
      return undefined;
    },
    is(value: string) {
      return value === contentType;
    }
  } as unknown as Request;
}

const response = {} as Response;

test('authenticateApiKey rejects missing credentials', () => {
  const middleware = authenticateApiKey(config);
  middleware(request(), response, ((error?: unknown) => {
    assert.ok(error && typeof error === 'object' && 'statusCode' in error && 'code' in error);
    assert.equal(error.statusCode, 401);
    assert.equal(error.code, 'unauthorized');
  }) as NextFunction);
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
  optionalIdempotencyKey(req, response, ((error?: unknown) => {
    assert.equal(error, undefined);
    assert.equal(req.idempotencyKey, 'orchestrate:topic-123');
  }) as NextFunction);

  optionalIdempotencyKey(request({ idempotencyKey: 'bad key!' }), response, ((error?: unknown) => {
    assert.ok(error && typeof error === 'object' && 'statusCode' in error && 'code' in error);
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'invalid_idempotency_key');
  }) as NextFunction);
});

test('authenticateApiKey attaches the configured role', () => {
  const req = request({ authorization: 'Bearer editor-token' });
  const middleware = authenticateApiKey(config);
  middleware(req, response, ((error?: unknown) => {
    assert.equal(error, undefined);
    assert.deepEqual(req.user, { role: 'editor', authMode: 'api-key' });
  }) as NextFunction);
});

test('requireRole allows editor access and blocks viewer access', () => {
  requireRole('editor')(request({ role: 'editor' }), response, ((error?: unknown) => {
    assert.equal(error, undefined);
  }) as NextFunction);

  requireRole('editor')(request({ role: 'viewer' }), response, ((error?: unknown) => {
    assert.ok(error && typeof error === 'object' && 'statusCode' in error && 'details' in error);
    assert.equal(error.statusCode, 403);
    assert.deepEqual(error.details, { requiredRole: 'editor' });
  }) as NextFunction);
});

test('validation rejects invalid memory types and non-object bodies', () => {
  requireMemoryType(request({ type: 'unknown' }), response, ((error?: unknown) => {
    assert.ok(error && typeof error === 'object' && 'statusCode' in error && 'code' in error);
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'invalid_memory_type');
  }) as NextFunction);

  requireObjectBody(request({ body: [] }), response, ((error?: unknown) => {
    assert.ok(error && typeof error === 'object' && 'statusCode' in error && 'code' in error);
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'invalid_body');
  }) as NextFunction);
});
