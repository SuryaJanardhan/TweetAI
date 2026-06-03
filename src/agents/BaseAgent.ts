import type { AgentResult } from '../types.js';

export class BaseAgent {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  async execute(context: unknown = {}): Promise<AgentResult> {
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
