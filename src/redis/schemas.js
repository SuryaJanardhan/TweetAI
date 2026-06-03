export const redisSchemas = {
  queues: {
    actionQueue: 'tweetai:queue:actions',
    retryQueue: 'tweetai:queue:retries'
  },
  rateLimiting: {
    daily: 'tweetai:rate:daily',
    hourly: 'tweetai:rate:hourly',
    rolling15m: 'tweetai:rate:rolling15m',
    burst1m: 'tweetai:rate:burst1m'
  },
  memoryCache: {
    trendSnapshot: 'tweetai:memory:trend_snapshot',
    strategyDraft: 'tweetai:memory:strategy_draft'
  },
  communication: {
    bus: 'tweetai:bus:agent_events'
  }
};
