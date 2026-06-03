import { BaseAgent } from './BaseAgent.js';
import type { AgentResult } from '../types.js';

const MAX_UTILIZATION = 0.8;
type SafetyWindow = 'daily' | 'hourly' | 'rolling15m' | 'burst1m';
type SafetyUsage = Record<SafetyWindow, number>;
type SafetyDecision =
  | { allowed: true; directive: 'execute'; usage?: SafetyUsage }
  | { allowed: false; directive: 'delay_or_queue'; blockedWindow: SafetyWindow; threshold: number };

export class TwitterSafetyGuardianAgent extends BaseAgent {
  limitConfig: SafetyUsage;
  usage: SafetyUsage;

  constructor(limits: Partial<SafetyUsage> = {}) {
    super('TwitterSafetyGuardianAgent');
    this.limitConfig = {
      daily: 100,
      hourly: 30,
      rolling15m: 10,
      burst1m: 3,
      ...limits
    };
    this.usage = {
      daily: 0,
      hourly: 0,
      rolling15m: 0,
      burst1m: 0
    };
  }

  getThreshold(window: SafetyWindow): number {
    return Math.floor(this.limitConfig[window] * MAX_UTILIZATION);
  }

  canExecute(weight = 1): SafetyDecision {
    const windows = Object.keys(this.usage) as SafetyWindow[];
    for (const window of windows) {
      if (this.usage[window] + weight > this.getThreshold(window)) {
        return {
          allowed: false,
          directive: 'delay_or_queue',
          blockedWindow: window,
          threshold: this.getThreshold(window)
        };
      }
    }

    return {
      allowed: true,
      directive: 'execute'
    };
  }

  trackAction(weight = 1): SafetyDecision {
    const safetyDecision = this.canExecute(weight);
    if (!safetyDecision.allowed) {
      return safetyDecision;
    }

    (Object.keys(this.usage) as SafetyWindow[]).forEach((window) => {
      this.usage[window] += weight;
    });

    return {
      allowed: true,
      directive: 'execute',
      usage: { ...this.usage }
    };
  }

  resetWindow(window: SafetyWindow): void {
    if (this.usage[window] !== undefined) {
      this.usage[window] = 0;
    }
  }

  async execute(context: unknown = {}): Promise<AgentResult> {
    return {
      ...(await super.execute(context)),
      limits: this.limitConfig,
      enforcedThresholds: Object.fromEntries(
        (Object.keys(this.limitConfig) as SafetyWindow[]).map((k) => [k, this.getThreshold(k)])
      ),
      usage: this.usage
    };
  }
}
