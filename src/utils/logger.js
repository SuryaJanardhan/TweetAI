import fs from 'node:fs/promises';
import path from 'node:path';

export class Logger {
  constructor(filePath = path.resolve(process.cwd(), 'data', 'logs', 'events.log')) {
    this.filePath = filePath;
  }

  async log(level, event, payload = {}) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, payload });
    await fs.appendFile(this.filePath, `${line}\n`, 'utf-8');
  }

  info(event, payload = {}) {
    return this.log('info', event, payload);
  }

  error(event, payload = {}) {
    return this.log('error', event, payload);
  }
}
