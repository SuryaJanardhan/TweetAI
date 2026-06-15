import { BaseAgent } from './BaseAgent.js';
import type { AgentResult } from '../types.js';
import { getRedisConnection, isRedisConnected } from '../redis/index.js';

const MAX_UTILIZATION = 0.8;
export type SafetyWindow = 'daily' | 'hourly' | 'rolling15m' | 'burst1m';
export type SafetyUsage = Record<SafetyWindow, number>;
export type SafetyDecision =
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

  async getUsage(): Promise<SafetyUsage> {
    if (isRedisConnected()) {
      const redis = getRedisConnection()!;
      const keys = [
        'safety:twitter:daily',
        'safety:twitter:hourly',
        'safety:twitter:rolling15m',
        'safety:twitter:burst1m'
      ];
      const vals = await redis.mget(keys);
      return {
        daily: parseInt(vals[0] || '0', 10),
        hourly: parseInt(vals[1] || '0', 10),
        rolling15m: parseInt(vals[2] || '0', 10),
        burst1m: parseInt(vals[3] || '0', 10)
      };
    }
    return this.usage;
  }

  async incrementUsage(weight = 1): Promise<SafetyUsage> {
    if (isRedisConnected()) {
      const redis = getRedisConnection()!;
      const windows = [
        { key: 'safety:twitter:daily', ttl: 86400 },
        { key: 'safety:twitter:hourly', ttl: 3600 },
        { key: 'safety:twitter:rolling15m', ttl: 900 },
        { key: 'safety:twitter:burst1m', ttl: 60 }
      ];

      const pipe = redis.multi();
      for (const win of windows) {
        // Atomic increment and TTL assignment on creation
        pipe.eval(
          `local val = redis.call('INCRBY', KEYS[1], ARGV[1])
           if tonumber(val) == tonumber(ARGV[1]) then
             redis.call('EXPIRE', KEYS[1], ARGV[2])
           end
           return val`,
          1,
          win.key,
          weight,
          win.ttl
        );
      }
      await pipe.exec();
      return this.getUsage();
    } else {
      (Object.keys(this.usage) as SafetyWindow[]).forEach((window) => {
        this.usage[window] += weight;
      });
      return { ...this.usage };
    }
  }

  async canExecute(weight = 1): Promise<SafetyDecision> {
    const currentUsage = await this.getUsage();
    const windows = Object.keys(currentUsage) as SafetyWindow[];
    for (const window of windows) {
      if (currentUsage[window] + weight > this.getThreshold(window)) {
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

  async trackAction(weight = 1): Promise<SafetyDecision> {
    const safetyDecision = await this.canExecute(weight);
    if (!safetyDecision.allowed) {
      return safetyDecision;
    }

    const nextUsage = await this.incrementUsage(weight);

    return {
      allowed: true,
      directive: 'execute',
      usage: nextUsage
    };
  }

  async resetWindow(window: SafetyWindow): Promise<void> {
    if (isRedisConnected()) {
      const redis = getRedisConnection()!;
      await redis.del(`safety:twitter:${window}`);
    } else {
      this.usage[window] = 0;
    }
  }

  async execute(context: unknown = {}): Promise<AgentResult> {
    const currentUsage = await this.getUsage();
    const superResult = await super.execute(context);
    return {
      ...superResult,
      limits: this.limitConfig,
      enforcedThresholds: Object.fromEntries(
        (Object.keys(this.limitConfig) as SafetyWindow[]).map((k) => [k, this.getThreshold(k)])
      ),
      usage: currentUsage
    };
  }
}
