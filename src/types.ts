export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type Role = 'viewer' | 'editor' | 'admin';

export interface ApiKeyConfig {
  token: string;
  role: Role;
}

export interface AppConfig {
  nodeEnv: string;
  port?: number;
  requestJsonLimit: string;
  auth: {
    required: boolean;
    apiKeys: ApiKeyConfig[];
  };
  safety: {
    dryRun: boolean;
  };
  geminiApiKey?: string;
  groqApiKey?: string;
  twitter?: {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessSecret: string;
  };
}

export interface AgentDecision {
  reason: string;
  confidence: number;
  expectedOutcome: string;
  riskScore: number;
}

export interface AgentResult {
  agent: string;
  timestamp: string;
  context?: unknown;
  decision: AgentDecision;
  [key: string]: unknown;
}

export interface Agent {
  execute(context?: unknown): Promise<AgentResult>;
}

export interface LoggerLike {
  info(event: string, payload?: Record<string, unknown>): Promise<void>;
  error(event: string, payload?: Record<string, unknown>): Promise<void>;
}
