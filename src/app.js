import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildAgents } from './agents/index.js';
import { MemoryStore } from './memory/MemoryStore.js';
import { Logger } from './utils/logger.js';
import { Orchestrator } from './core/Orchestrator.js';
import { createApiRouter } from './routes/api.js';
import { openApiSpec } from './openapi.js';
import { loadConfig } from './config.js';
import { authenticateApiKey } from './middleware/auth.js';
import { assignRequestContext } from './middleware/requestContext.js';

export async function createApp(options = {}) {
  const config = options.config ?? loadConfig();
  const app = express();
  app.use(assignRequestContext);
  app.use(express.json({ limit: config.requestJsonLimit }));

  const agents = options.agents ?? buildAgents();
  const memoryStore = options.memoryStore ?? new MemoryStore();
  await memoryStore.initialize();
  const logger = options.logger ?? new Logger(config.nodeEnv === 'production' ? { sink: 'stdout' } : undefined);
  const orchestrator = options.orchestrator ?? new Orchestrator({ agents, memoryStore, logger });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get('/openapi.json', (_req, res) => res.json(openApiSpec));
  app.use(authenticateApiKey(config));
  app.use('/', createApiRouter({ orchestrator, memoryStore, agents, logger }));

  app.use((error, _req, res, _next) => {
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
  });

  return { app, services: { agents, memoryStore, orchestrator, config } };
}
