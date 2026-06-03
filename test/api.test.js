import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateApiKey, requireRole } from '../src/middleware/auth.js';
import { requireMemoryType, requireObjectBody } from '../src/middleware/validation.js';

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

function request({ authorization, role, body = {}, type = 'working', contentType = 'application/json' } = {}) {
  return {
    body,
    params: { type },
    user: role ? { role } : undefined,
    header(name) {
      return name.toLowerCase() === 'authorization' ? authorization : undefined;
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
