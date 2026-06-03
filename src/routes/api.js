import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { googleSheetSchemas } from '../sheets/schemas.js';
import { redisSchemas } from '../redis/schemas.js';
import { requireMemoryType, requireNonEmptyObjectBody, requireObjectBody } from '../middleware/validation.js';

export function createApiRouter({ orchestrator, memoryStore, agents, logger }) {
  const router = express.Router();

  router.get('/system-health', async (_req, res) => {
    res.json({ status: 'ok', readiness: 'ready', time: new Date().toISOString() });
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

  router.post('/orchestrate', requireRole('editor'), requireObjectBody, async (req, res, next) => {
    try {
      const cycle = await orchestrator.loop(req.body);
      await logger.info('orchestrate.requested', { requestId: req.requestId, userRole: req.user.role });
      res.json(cycle);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
