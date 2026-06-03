import { BaseAgent } from './BaseAgent.js';
import { TwitterSafetyGuardianAgent } from './TwitterSafetyGuardianAgent.js';

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
];

export const buildAgents = () => {
  const agents = Object.fromEntries(names.map((name) => [name, new BaseAgent(name)]));
  agents.TwitterSafetyGuardianAgent = new TwitterSafetyGuardianAgent();
  return agents;
};
