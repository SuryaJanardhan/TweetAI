import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildAgents } from './agents/index.js';
import { MemoryStore } from './memory/MemoryStore.js';
import { Logger } from './utils/logger.js';
import { Orchestrator } from './core/Orchestrator.js';
import { createApiRouter } from './routes/api.js';
import { openApiSpec } from './openapi.js';

export async function createApp() {
  const app = express();
  app.use(express.json());

  const agents = buildAgents();
  const memoryStore = new MemoryStore();
  await memoryStore.initialize();
  const logger = new Logger();
  const orchestrator = new Orchestrator({ agents, memoryStore, logger });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get('/openapi.json', (_req, res) => res.json(openApiSpec));
  app.use('/', createApiRouter({ orchestrator, memoryStore, agents }));

  app.use((error, _req, res, _next) => {
    res.status(400).json({ error: error.message });
  });

  return { app, services: { agents, memoryStore, orchestrator } };
}
