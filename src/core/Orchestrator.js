export class Orchestrator {
  constructor({ agents, memoryStore, logger }) {
    this.agents = agents;
    this.memoryStore = memoryStore;
    this.logger = logger;
  }

  async loop(context = {}) {
    const safety = this.agents.TwitterSafetyGuardianAgent.canExecute(1);
    if (!safety.allowed) {
      return {
        phase: 'guarded',
        safety,
        message: 'Safety guardian delayed execution'
      };
    }

    const observe = await this.agents.TrendDiscoveryAgent.execute(context);
    const think = await this.agents.ConversationUnderstandingAgent.execute({ observe, context });
    const plan = await this.agents.StrategyAgent.execute({ think, context });
    const act = await this.agents.EngagementAgent.execute({ plan, context });
    const reflect = await this.agents.ReflectionAgent.execute({ act, context });
    const learn = await this.agents.LearningAgent.execute({ reflect, context });

    this.agents.TwitterSafetyGuardianAgent.trackAction(1);

    const cycle = { observe, think, plan, act, reflect, learn };
    await this.memoryStore.add('episodic', cycle);
    this.logger.info('orchestrator.loop.completed', { phase: 'observe-think-plan-act-reflect-learn' });
    return cycle;
  }
}
