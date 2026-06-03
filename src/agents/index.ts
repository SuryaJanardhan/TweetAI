import { BaseAgent } from './BaseAgent.js';
import { TwitterSafetyGuardianAgent } from './TwitterSafetyGuardianAgent.js';
import type { Agent } from '../types.js';

const names = [
  'TrendDiscoveryAgent',
  'CommunityIntelligenceAgent',
  'ConversationUnderstandingAgent',
  'MemoryAgent',
  'StrategyAgent',
  'ContentAgent',
  'HumanBehaviorAgent',
  'EngagementAgent',
  'ReflectionAgent',
  'LearningAgent'
] as const;

export type BaseAgentName = (typeof names)[number];
export type AgentRegistry = Record<BaseAgentName, Agent> & {
  TwitterSafetyGuardianAgent: TwitterSafetyGuardianAgent;
};

export const buildAgents = (): AgentRegistry => {
  const agents = Object.fromEntries(names.map((name) => [name, new BaseAgent(name)])) as unknown as AgentRegistry;
  agents.TwitterSafetyGuardianAgent = new TwitterSafetyGuardianAgent();
  return agents;
};
