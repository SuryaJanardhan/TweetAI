import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { AgentRegistry } from '../agents/index.js';
import type { JobRunner } from '../jobs/JobRunner.js';
import type { JobStore } from '../jobs/JobStore.js';
import type { MemoryStore } from '../memory/MemoryStore.js';
import type { LoggerLike, Role } from '../types.js';
import { requireRole } from '../middleware/auth.js';
import { googleSheetSchemas } from '../sheets/schemas.js';
import { redisSchemas } from '../redis/schemas.js';
import {
  optionalIdempotencyKey,
  requireMemoryType,
  requireNonEmptyObjectBody,
  requireObjectBody
} from '../middleware/validation.js';

interface ApiRouterDependencies {
  memoryStore: MemoryStore;
  agents: AgentRegistry;
  logger: LoggerLike;
  jobStore: JobStore;
  jobRunner: JobRunner;
}

function requestRole(req: Request): Role {
  return req.user?.role ?? 'viewer';
}

export function createApiRouter({ memoryStore, agents, logger, jobStore, jobRunner }: ApiRouterDependencies) {
  const router = express.Router();

  router.get('/system-health', async (_req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  router.get('/system-readiness', async (_req: Request, res: Response) => {
    const checks = {
      memory: await memoryStore.dependencyStatus(),
      jobs: await jobStore.dependencyStatus()
    };

    const ready = Object.values(checks).every((check) => check.status === 'ok');
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks,
      time: new Date().toISOString()
    });
  });

  router.get('/agents', (_req: Request, res: Response) => {
    res.json({ agents: Object.keys(agents) });
  });

  router.get('/memory/:type', requireMemoryType, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const memoryType = String(req.params.type);
      const records = await memoryStore.get(memoryType);
      res.json({ type: memoryType, records });
    } catch (error) {
      next(error);
    }
  });

  router.post('/memory/:type', requireRole('editor'), requireMemoryType, requireNonEmptyObjectBody, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const memoryType = String(req.params.type);
      const record = await memoryStore.add(memoryType, req.body);
      await logger.info('memory.write', {
        requestId: req.requestId,
        userRole: requestRole(req),
        memoryType
      });
      res.status(201).json(record);
    } catch (error) {
      next(error);
    }
  });

  router.get('/trends', (_req: Request, res: Response) => {
    res.json({ dataSource: 'TrendDiscoveryAgent', sample: [] });
  });

  router.get('/actions', (_req: Request, res: Response) => {
    res.json({ dataSource: 'ActionsLog', safety: agents.TwitterSafetyGuardianAgent.usage });
  });

  router.get('/jobs/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await jobStore.get(String(req.params.id));
      res.json(job);
    } catch (error) {
      next(error);
    }
  });

  router.get('/tweets', (_req: Request, res: Response) => {
    res.json({ dataSource: 'TweetsDatabase', sample: [] });
  });

  router.get('/analytics', (_req: Request, res: Response) => {
    res.json({
      insights: ['best posting styles', 'best engagement styles', 'best topic categories'],
      visualizations: ['line charts', 'trend graphs', 'growth graphs', 'heatmaps', 'funnel analysis']
    });
  });

  router.get('/reports', (_req: Request, res: Response) => {
    res.json({
      googleSheetSchemas,
      redisSchemas
    });
  });

  router.post('/reflection', requireRole('editor'), requireObjectBody, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await agents.ReflectionAgent.execute(req.body);
      await memoryStore.add('strategic', result);
      await logger.info('reflection.write', { requestId: req.requestId, userRole: requestRole(req) });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/learning', requireRole('editor'), requireObjectBody, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await agents.LearningAgent.execute(req.body);
      await memoryStore.add('semantic', result);
      await logger.info('learning.write', { requestId: req.requestId, userRole: requestRole(req) });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/orchestrate', requireRole('editor'), requireObjectBody, optionalIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { job, created } = await jobStore.create({
        type: 'orchestration',
        payload: req.body,
        requestedBy: { role: requestRole(req) },
        requestId: req.requestId,
        idempotencyKey: req.idempotencyKey
      });

      if (created) {
        jobRunner.start(job);
      }

      await logger.info('orchestrate.queued', {
        requestId: req.requestId,
        userRole: requestRole(req),
        jobId: job.id,
        reused: !created
      });

      res.status(created ? 202 : 200).json({
        jobId: job.id,
        status: job.status,
        idempotencyKey: job.idempotencyKey,
        links: {
          status: `/jobs/${job.id}`
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
