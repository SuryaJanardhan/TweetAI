import test from 'node:test';
import assert from 'node:assert/strict';
import { TwitterSafetyGuardianAgent } from '../src/agents/TwitterSafetyGuardianAgent.js';

test('TwitterSafetyGuardianAgent enforces 20% safety buffer', () => {
  const agent = new TwitterSafetyGuardianAgent({ daily: 100, hourly: 10, rolling15m: 10, burst1m: 10 });
  assert.equal(agent.getThreshold('daily'), 80);
  assert.equal(agent.getThreshold('hourly'), 8);

  for (let i = 0; i < 8; i += 1) {
    assert.equal(agent.trackAction(1).allowed, true);
  }

  const blocked = agent.trackAction(1);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.directive, 'delay_or_queue');
});
