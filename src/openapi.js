export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Tweet-AI API',
    version: '1.0.0',
    description: 'Autonomous Twitter AI orchestration platform API'
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'API key passed as a Bearer token'
      }
    }
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/agents': { get: { summary: 'List agents' } },
    '/memory/{type}': {
      get: { summary: 'Read memory by type' },
      post: { summary: 'Write memory by type' }
    },
    '/trends': { get: { summary: 'Trend intelligence feed' } },
    '/actions': { get: { summary: 'Action log view' } },
    '/tweets': { get: { summary: 'Tweets database view' } },
    '/analytics': { get: { summary: 'Analytics insights' } },
    '/reports': { get: { summary: 'Report schemas and metadata' } },
    '/reflection': { post: { summary: 'Store daily reflection result' } },
    '/learning': { post: { summary: 'Store learning outcome' } },
    '/system-health': { get: { summary: 'Service health endpoint' } },
    '/orchestrate': { post: { summary: 'Run Observe→Think→Plan→Act→Reflect→Learn cycle' } }
  }
};
