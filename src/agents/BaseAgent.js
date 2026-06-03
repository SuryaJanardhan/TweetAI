export class BaseAgent {
  constructor(name) {
    this.name = name;
  }

  async execute(context = {}) {
    return {
      agent: this.name,
      timestamp: new Date().toISOString(),
      context,
      decision: {
        reason: `${this.name} processed context`,
        confidence: 0.6,
        expectedOutcome: 'Incremental improvement in engagement quality',
        riskScore: 0.2
      }
    };
  }
}
