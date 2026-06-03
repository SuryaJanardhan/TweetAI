import { BaseAgent } from './BaseAgent.js';

const MAX_UTILIZATION = 0.8;

export class TwitterSafetyGuardianAgent extends BaseAgent {
  constructor(limits = {}) {
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

  getThreshold(window) {
    return Math.floor(this.limitConfig[window] * MAX_UTILIZATION);
  }

  canExecute(weight = 1) {
    const windows = Object.keys(this.usage);
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

  trackAction(weight = 1) {
    const safetyDecision = this.canExecute(weight);
    if (!safetyDecision.allowed) {
      return safetyDecision;
    }

    Object.keys(this.usage).forEach((window) => {
      this.usage[window] += weight;
    });

    return {
      allowed: true,
      directive: 'execute',
      usage: { ...this.usage }
    };
  }

  resetWindow(window) {
    if (this.usage[window] !== undefined) {
      this.usage[window] = 0;
    }
  }

  async execute(context = {}) {
    return {
      ...(await super.execute(context)),
      limits: this.limitConfig,
      enforcedThresholds: Object.fromEntries(
        Object.keys(this.limitConfig).map((k) => [k, this.getThreshold(k)])
      ),
      usage: this.usage
    };
  }
}
