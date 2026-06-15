import express, { type ErrorRequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildAgents } from './agents/index.js';
import type { AgentRegistry } from './agents/index.js';
import { MemoryStore } from './memory/MemoryStore.js';
import { Logger } from './utils/logger.js';
import { Orchestrator } from './core/Orchestrator.js';
import { createApiRouter } from './routes/api.js';
import { openApiSpec } from './openapi.js';
import { loadConfig } from './config.js';
import { authenticateApiKey } from './middleware/auth.js';
import { assignRequestContext } from './middleware/requestContext.js';
import { JobStore } from './jobs/JobStore.js';
import { JobRunner } from './jobs/JobRunner.js';
import type { AppConfig, LoggerLike } from './types.js';
import type { AppError } from './utils/errors.js';

import { runMigrations } from './db/migrate.js';

interface CreateAppOptions {
  config?: AppConfig;
  agents?: AgentRegistry;
  memoryStore?: MemoryStore;
  logger?: LoggerLike;
  orchestrator?: Orchestrator;
  jobStore?: JobStore;
  jobRunner?: JobRunner;
}

export async function createApp(options: CreateAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const app = express();
  app.use(assignRequestContext);
  app.use(express.json({ limit: config.requestJsonLimit }));

  // Run database migrations
  await runMigrations();

  const agents = options.agents ?? buildAgents();
  const memoryStore = options.memoryStore ?? new MemoryStore();
  await memoryStore.initialize();
  const logger = options.logger ?? (config.nodeEnv === 'production' ? new Logger({ sink: 'stdout' }) : new Logger());
  const orchestrator = options.orchestrator ?? new Orchestrator({ agents, memoryStore, logger });
  const jobStore = options.jobStore ?? new JobStore();
  await jobStore.initialize();
  const jobRunner = options.jobRunner ?? new JobRunner({ jobStore, orchestrator, logger });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get('/openapi.json', (_req, res) => res.json(openApiSpec));
  app.use(authenticateApiKey(config));
  app.use('/', createApiRouter({ memoryStore, agents, logger, jobStore, jobRunner }));

  const errorHandler: ErrorRequestHandler = (error: AppError & { status?: number }, _req, res, _next) => {
    const statusCode = error.statusCode || error.status || 500;
    const code = error.code || 'internal_error';
    const message = statusCode >= 500 ? 'Internal server error' : error.message;
    res.status(statusCode).json({
      error: {
        code,
        message,
        requestId: _req.requestId,
        ...(error.details ? { details: error.details } : {})
      }
    });
  };
  app.use(errorHandler);

  return { app, services: { agents, memoryStore, orchestrator, jobStore, jobRunner, config } };
}
