import type { ApiKeyConfig, AppConfig, Role } from './types.js';

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
    }
  };

  if (!config.auth.required && nodeEnv === 'production') {
    throw new Error('AUTH_REQUIRED cannot be false in production');
  }

  return config;
}
