import test from 'node:test';
import assert from 'node:assert/strict';
import { generateText } from '../src/utils/llm.js';
import { postTweet } from '../src/utils/twitter.js';

test('generateText returns a mocked response when API keys are not set', async () => {
  const result = await generateText('Hello world', { jsonMode: true });
  const parsed = JSON.parse(result);
  
  assert.ok(parsed.mocked);
  assert.ok(Array.isArray(parsed.topics));
  assert.equal(typeof parsed.content, 'string');
});

test('postTweet returns a dryRun simulation by default', async () => {
  const result = await postTweet('Test Tweet content');
  
  assert.ok(result.dryRun);
  assert.ok(result.tweetId.startsWith('dryrun_'));
  assert.equal(result.text, 'Test Tweet content');
});
