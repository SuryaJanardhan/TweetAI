import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('loadConfig requires API keys in production', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', PORT: '3000' }),
    /AUTH_API_KEYS is required in production/
  );
});

test('loadConfig parses API keys and port', () => {
  const config = loadConfig({
    NODE_ENV: 'production',
    PORT: '8080',
    AUTH_API_KEYS: 'viewer-token:viewer,admin-token:admin',
    DRY_RUN: 'false',
    GEMINI_API_KEY: 'dummy-gemini-key',
    TWITTER_API_KEY: 'dummy-twitter-key',
    TWITTER_API_SECRET: 'dummy-twitter-secret',
    TWITTER_ACCESS_TOKEN: 'dummy-twitter-token',
    TWITTER_ACCESS_SECRET: 'dummy-twitter-access-secret'
  });

  assert.equal(config.port, 8080);
  assert.equal(config.safety.dryRun, false);
  assert.deepEqual(config.auth.apiKeys, [
    { token: 'viewer-token', role: 'viewer' },
    { token: 'admin-token', role: 'admin' }
  ]);
});
