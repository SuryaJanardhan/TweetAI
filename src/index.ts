import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { closePool } from './db/index.js';
import { closeRedisConnection } from './redis/index.js';

const config = loadConfig();
const { app, services } = await createApp({ config });
const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Tweet-AI API listening on :${config.port}`);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}; closing HTTP server`);
  try {
    await services.jobRunner.shutdown();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error shutting down job runner:', err);
  }
  try {
    await closePool();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error closing database pool:', err);
  }
  try {
    await closeRedisConnection();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error closing Redis connection:', err);
  }
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
