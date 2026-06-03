import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgents } from '../src/agents/index.js';
import { Orchestrator } from '../src/core/Orchestrator.js';
import { MemoryStore } from '../src/memory/MemoryStore.js';
import { Logger } from '../src/utils/logger.js';
import path from 'node:path';

test('Orchestrator cycle writes episodic memory with decision fields', async () => {
  const memoryStore = new MemoryStore(path.resolve(process.cwd(), 'data', 'test-memory'));
  await memoryStore.initialize();

  const orchestrator = new Orchestrator({
    agents: buildAgents(),
    memoryStore,
    logger: new Logger(path.resolve(process.cwd(), 'data', 'test-logs', 'events.log'))
  });

  const result = await orchestrator.loop({ topic: 'nodejs' });
  assert.equal(typeof result.plan.decision.reason, 'string');
  assert.equal(typeof result.plan.decision.confidence, 'number');
  assert.equal(typeof result.plan.decision.expectedOutcome, 'string');
  assert.equal(typeof result.plan.decision.riskScore, 'number');

  const episodes = await memoryStore.get('episodic');
  assert.ok(episodes.length >= 1);
});

test('Orchestrator rejects invalid agent output before continuing', async () => {
  const memoryStore = new MemoryStore(path.resolve(process.cwd(), 'data', 'invalid-agent-test-memory'));
  await memoryStore.initialize();

  const agents = buildAgents();
  agents.StrategyAgent = {
    execute: async () => ({ agent: 'StrategyAgent', timestamp: new Date().toISOString() })
  };

  const orchestrator = new Orchestrator({
    agents,
    memoryStore,
    logger: new Logger(path.resolve(process.cwd(), 'data', 'invalid-agent-test-logs', 'events.log'))
  });

  await assert.rejects(() => orchestrator.loop({ topic: 'nodejs' }), {
    code: 'invalid_agent_output'
  });
});
