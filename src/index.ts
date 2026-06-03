import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { app } = await createApp({ config });
const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Tweet-AI API listening on :${config.port}`);
});

function shutdown(signal: NodeJS.Signals): void {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}; closing HTTP server`);
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
