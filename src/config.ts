import type { ApiKeyConfig, AppConfig, Role } from './types.js';
import fs from 'node:fs';
import path from 'node:path';

// Parse .env manually if it exists
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index !== -1) {
        const key = trimmed.slice(0, index).trim();
        const value = trimmed.slice(index + 1).trim();
        // Remove surrounding quotes if present
        const cleanedValue = value.replace(/^(['"])(.*)\1$/, '$2');
        if (!(key in process.env)) {
          process.env[key] = cleanedValue;
        }
      }
    }
  }
} catch (err) {
  // Ignore filesystem errors
}

const VALID_ROLES = new Set<Role>(['viewer', 'editor', 'admin']);
const DEFAULT_NON_PRODUCTION_KEYS: ApiKeyConfig[] = [
  { token: 'dev-viewer-token', role: 'viewer' },
  { token: 'dev-editor-token', role: 'editor' },
  { token: 'dev-admin-token', role: 'admin' }
];

function parsePort(value: string | undefined): number {
  const port = Number.parseInt(value ?? '3000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error('Boolean environment variables must be "true" or "false"');
}

function isRole(value: string): value is Role {
  return VALID_ROLES.has(value as Role);
}

function parseApiKeys(value: string | undefined, nodeEnv: string): ApiKeyConfig[] {
  if (!value) {
    if (nodeEnv === 'production') {
      throw new Error('AUTH_API_KEYS is required in production');
    }
    return DEFAULT_NON_PRODUCTION_KEYS;
  }

  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [token, role] = entry.split(':');
      if (!token || !role || !isRole(role)) {
        throw new Error('AUTH_API_KEYS entries must use token:viewer|editor|admin format');
      }
      return { token, role };
    });

  if (entries.length === 0) {
    throw new Error('AUTH_API_KEYS must contain at least one API key');
  }

  return entries;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV || 'development';
  
  const twitterConfig = env.TWITTER_API_KEY || env.TWITTER_API_SECRET || env.TWITTER_ACCESS_TOKEN || env.TWITTER_ACCESS_SECRET
    ? {
        apiKey: env.TWITTER_API_KEY || '',
        apiSecret: env.TWITTER_API_SECRET || '',
        accessToken: env.TWITTER_ACCESS_TOKEN || '',
        accessSecret: env.TWITTER_ACCESS_SECRET || ''
      }
    : undefined;

  const config: AppConfig = {
    nodeEnv,
    port: parsePort(env.PORT),
    requestJsonLimit: env.REQUEST_JSON_LIMIT || '100kb',
    auth: {
      required: parseBoolean(env.AUTH_REQUIRED, true),
      apiKeys: parseApiKeys(env.AUTH_API_KEYS, nodeEnv)
    },
    safety: {
      dryRun: parseBoolean(env.DRY_RUN, nodeEnv !== 'production')
    },
    geminiApiKey: env.GEMINI_API_KEY,
    groqApiKey: env.GROQ_API_KEY,
    twitter: twitterConfig,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL
  };

  if (!config.auth.required && nodeEnv === 'production') {
    throw new Error('AUTH_REQUIRED cannot be false in production');
  }

  if (nodeEnv === 'production') {
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL must be configured in production');
    }
    if (!config.redisUrl) {
      throw new Error('REDIS_URL must be configured in production');
    }
    if (!config.geminiApiKey && !config.groqApiKey) {
      throw new Error('At least one of GEMINI_API_KEY or GROQ_API_KEY must be configured in production');
    }
    if (!config.safety.dryRun) {
      if (
        !config.twitter?.apiKey ||
        !config.twitter?.apiSecret ||
        !config.twitter?.accessToken ||
        !config.twitter?.accessSecret
      ) {
        throw new Error(
          'All TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_SECRET must be configured in production when DRY_RUN is false'
        );
      }
    }
  }

  return config;
}
