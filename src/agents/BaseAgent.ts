import { generateText } from '../utils/llm.js';
import { postTweet } from '../utils/twitter.js';
import type { AgentResult } from '../types.js';

export class BaseAgent {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  async execute(context: unknown = {}): Promise<AgentResult> {
    const prompt = this.getPromptForAgent(context);
    
    // Call unified LLM with Groq fallback
    const responseText = await generateText(prompt, { jsonMode: true });
    
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = {
        reason: responseText,
        confidence: 0.7,
        expectedOutcome: 'Raw text generation parsed',
        riskScore: 0.1
      };
    }

    const decision = {
      reason: parsed.reason || parsed.decision?.reason || 'Agent execution complete',
      confidence: parsed.confidence || parsed.decision?.confidence || 0.7,
      expectedOutcome: parsed.expectedOutcome || parsed.decision?.expectedOutcome || 'Successful step in agent loop',
      riskScore: parsed.riskScore || parsed.decision?.riskScore || 0.1
    };

    const baseResult: AgentResult = {
      agent: this.name,
      timestamp: new Date().toISOString(),
      context,
      decision,
      ...parsed
    };

    // If it's the EngagementAgent, execute the action on Twitter
    if (this.name === 'EngagementAgent') {
      const tweetText = parsed.tweetText || 'Autonomous AI Agent online. #AI';
      try {
        const twitterResult = await postTweet(tweetText);
        baseResult.twitterAction = twitterResult;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        baseResult.twitterAction = {
          failed: true,
          error: err.message
        };
      }
    }

    return baseResult;
  }

  private getPromptForAgent(context: unknown): string {
    const contextStr = JSON.stringify(context, null, 2);
    
    switch (this.name) {
      case 'TrendDiscoveryAgent':
        return `You are the TrendDiscoveryAgent in an autonomous Twitter agent system.
Analyze the current inputs/context and identify the top trending technical topics or developer discussions.
Return a JSON object conforming to this schema:
{
  "reason": "Why these trends are chosen",
  "confidence": 0.85,
  "expectedOutcome": "Identify relevant topics to join",
  "riskScore": 0.1,
  "trends": ["trend1", "trend2", "trend3"]
}

Context:
${contextStr}`;

      case 'ConversationUnderstandingAgent':
        return `You are the ConversationUnderstandingAgent.
Analyze the discovered trends and extract sentiment, key community opinions, or developer debates.
Return a JSON object conforming to this schema:
{
  "reason": "Analysis explanation",
  "confidence": 0.8,
  "expectedOutcome": "Understand discussion tone",
  "riskScore": 0.1,
  "insights": ["insight1", "insight2"]
}

Context:
${contextStr}`;

      case 'StrategyAgent':
        return `You are the StrategyAgent.
Formulate a tweet posting or engagement strategy based on the understanding of the conversation insights.
Return a JSON object conforming to this schema:
{
  "reason": "Strategic justification",
  "confidence": 0.9,
  "expectedOutcome": "Increase visibility and domain authority",
  "riskScore": 0.2,
  "actionType": "tweet" or "none",
  "targetTopic": "Topic name to construct content on",
  "tone": "informative" or "witty" or "thought-provoking"
}

Context:
${contextStr}`;

      case 'EngagementAgent':
        return `You are the Content and EngagementAgent.
Draft a single, highly engaging tweet about the strategy's targetTopic with the specified tone.
CRITICAL: The tweet must be less than 280 characters, professional, must NOT sound like typical generic AI spam (avoid words like "Delve", "tapestry", "revolutionize", "testament").
Return a JSON object conforming to this schema:
{
  "reason": "How this draft fits the strategy and tone",
  "confidence": 0.9,
  "expectedOutcome": "High quality tweet posted",
  "riskScore": 0.1,
  "tweetText": "The actual draft of the tweet (< 280 characters)"
}

Context:
${contextStr}`;

      case 'ReflectionAgent':
        return `You are the ReflectionAgent.
Examine the executed action outcome (specifically looking at the tweet draft and posting details). Evaluate if the action aligned with safety principles, strategy goals, and quality.
Return a JSON object conforming to this schema:
{
  "reason": "Reflection analysis summary",
  "confidence": 0.85,
  "expectedOutcome": "Ensure compliance and trace outcomes",
  "riskScore": 0.1,
  "reflection": "Detailed reflection feedback"
}

Context:
${contextStr}`;

      case 'LearningAgent':
        return `You are the LearningAgent.
Identify the core lessons, observations, or rules learned from this orchestration cycle.
Return a JSON object conforming to this schema:
{
  "reason": "Why this lesson is important",
  "confidence": 0.9,
  "expectedOutcome": "Optimize future cycles",
  "riskScore": 0.1,
  "lesson": "Detailed takeaway or rule for memory storage"
}

Context:
${contextStr}`;

      default:
        return `You are ${this.name}, an AI assistant agent.
Process the context and return a standard decision JSON object:
{
  "reason": "Action processed successfully",
  "confidence": 0.8,
  "expectedOutcome": "Task completed",
  "riskScore": 0.1
}

Context:
${contextStr}`;
    }
  }
}
