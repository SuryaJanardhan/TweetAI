import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { googleSheetSchemas } from '../sheets/schemas.js';
import { redisSchemas } from '../redis/schemas.js';
import {
  optionalIdempotencyKey,
  requireMemoryType,
  requireNonEmptyObjectBody,
  requireObjectBody
} from '../middleware/validation.js';

export function createApiRouter({ memoryStore, agents, logger, jobStore, jobRunner }) {
  const router = express.Router();

  router.get('/system-health', async (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  router.get('/system-readiness', async (_req, res) => {
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

  router.get('/agents', (_req, res) => {
    res.json({ agents: Object.keys(agents) });
  });

  router.get('/memory/:type', requireMemoryType, async (req, res, next) => {
    try {
      const records = await memoryStore.get(req.params.type);
      res.json({ type: req.params.type, records });
    } catch (error) {
      next(error);
    }
  });

  router.post('/memory/:type', requireRole('editor'), requireMemoryType, requireNonEmptyObjectBody, async (req, res, next) => {
    try {
      const record = await memoryStore.add(req.params.type, req.body);
      await logger.info('memory.write', {
        requestId: req.requestId,
        userRole: req.user.role,
        memoryType: req.params.type
      });
      res.status(201).json(record);
    } catch (error) {
      next(error);
    }
  });

  router.get('/trends', (_req, res) => {
    res.json({ dataSource: 'TrendDiscoveryAgent', sample: [] });
  });

  router.get('/actions', (_req, res) => {
    res.json({ dataSource: 'ActionsLog', safety: agents.TwitterSafetyGuardianAgent.usage });
  });

  router.get('/jobs/:id', async (req, res, next) => {
    try {
      const job = await jobStore.get(req.params.id);
      res.json(job);
    } catch (error) {
      next(error);
    }
  });

  router.get('/tweets', (_req, res) => {
    res.json({ dataSource: 'TweetsDatabase', sample: [] });
  });

  router.get('/analytics', (_req, res) => {
    res.json({
      insights: ['best posting styles', 'best engagement styles', 'best topic categories'],
      visualizations: ['line charts', 'trend graphs', 'growth graphs', 'heatmaps', 'funnel analysis']
    });
  });

  router.get('/reports', (_req, res) => {
    res.json({
      googleSheetSchemas,
      redisSchemas
    });
  });

  router.post('/reflection', requireRole('editor'), requireObjectBody, async (req, res, next) => {
    try {
      const result = await agents.ReflectionAgent.execute(req.body);
      await memoryStore.add('strategic', result);
      await logger.info('reflection.write', { requestId: req.requestId, userRole: req.user.role });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/learning', requireRole('editor'), requireObjectBody, async (req, res, next) => {
    try {
      const result = await agents.LearningAgent.execute(req.body);
      await memoryStore.add('semantic', result);
      await logger.info('learning.write', { requestId: req.requestId, userRole: req.user.role });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/orchestrate', requireRole('editor'), requireObjectBody, optionalIdempotencyKey, async (req, res, next) => {
    try {
      const { job, created } = await jobStore.create({
        type: 'orchestration',
        payload: req.body,
        requestedBy: { role: req.user.role },
        requestId: req.requestId,
        idempotencyKey: req.idempotencyKey
      });

      if (created) {
        jobRunner.start(job);
      }

      await logger.info('orchestrate.queued', {
        requestId: req.requestId,
        userRole: req.user.role,
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
