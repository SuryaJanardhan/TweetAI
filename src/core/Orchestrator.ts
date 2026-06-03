import { AppError } from '../utils/errors.js';
import type { AgentResult, LoggerLike } from '../types.js';
import type { AgentRegistry } from '../agents/index.js';
import type { MemoryStore } from '../memory/MemoryStore.js';

export type OrchestrationCycle = {
  observe: AgentResult;
  think: AgentResult;
  plan: AgentResult;
  act: AgentResult;
  reflect: AgentResult;
  learn: AgentResult;
};

export type GuardedCycle = {
  phase: 'guarded';
  safety: unknown;
  message: string;
};

interface OrchestratorDependencies {
  agents: AgentRegistry;
  memoryStore: MemoryStore;
  logger: LoggerLike;
}

function assertAgentResult(phase: string, result: unknown): asserts result is AgentResult {
  if (!result || typeof result !== 'object') {
    throw new AppError(502, 'invalid_agent_output', `${phase} returned an invalid result`);
  }

  const candidate = result as Partial<AgentResult>;
  if (typeof candidate.agent !== 'string' || typeof candidate.timestamp !== 'string') {
    throw new AppError(502, 'invalid_agent_output', `${phase} result is missing required metadata`);
  }

  const decision = candidate.decision;
  if (
    !decision ||
    typeof decision.reason !== 'string' ||
    typeof decision.confidence !== 'number' ||
    typeof decision.expectedOutcome !== 'string' ||
    typeof decision.riskScore !== 'number'
  ) {
    throw new AppError(502, 'invalid_agent_output', `${phase} result is missing decision fields`);
  }
}

export class Orchestrator {
  agents: AgentRegistry;
  memoryStore: MemoryStore;
  logger: LoggerLike;

  constructor({ agents, memoryStore, logger }: OrchestratorDependencies) {
    this.agents = agents;
    this.memoryStore = memoryStore;
    this.logger = logger;
  }

  async loop(context: unknown = {}): Promise<OrchestrationCycle | GuardedCycle> {
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      throw new AppError(400, 'invalid_context', 'Orchestration context must be a JSON object');
    }

    const safety = this.agents.TwitterSafetyGuardianAgent.canExecute(1);
    if (!safety.allowed) {
      await this.logger.info('orchestrator.loop.blocked', { safety });
      return {
        phase: 'guarded',
        safety,
        message: 'Safety guardian delayed execution'
      };
    }

    const observe = await this.agents.TrendDiscoveryAgent.execute(context);
    assertAgentResult('observe', observe);
    const think = await this.agents.ConversationUnderstandingAgent.execute({ observe, context });
    assertAgentResult('think', think);
    const plan = await this.agents.StrategyAgent.execute({ think, context });
    assertAgentResult('plan', plan);
    const act = await this.agents.EngagementAgent.execute({ plan, context });
    assertAgentResult('act', act);
    const reflect = await this.agents.ReflectionAgent.execute({ act, context });
    assertAgentResult('reflect', reflect);
    const learn = await this.agents.LearningAgent.execute({ reflect, context });
    assertAgentResult('learn', learn);

    this.agents.TwitterSafetyGuardianAgent.trackAction(1);

    const cycle = { observe, think, plan, act, reflect, learn };
    await this.memoryStore.add('episodic', cycle);
    await this.logger.info('orchestrator.loop.completed', { phase: 'observe-think-plan-act-reflect-learn' });
    return cycle;
  }
}
