import fs from 'node:fs/promises';
import path from 'node:path';
import type { LoggerLike } from '../types.js';

type LoggerSink = 'file' | 'stdout';
type LoggerTarget = string | { filePath?: string; sink?: LoggerSink };

export class Logger implements LoggerLike {
  filePath: string;
  sink: LoggerSink;

  constructor(target: LoggerTarget = path.resolve(process.cwd(), 'data', 'logs', 'events.log')) {
    if (typeof target === 'string') {
      this.filePath = target;
      this.sink = 'file';
      return;
    }

    this.filePath = target.filePath ?? path.resolve(process.cwd(), 'data', 'logs', 'events.log');
    this.sink = target.sink || 'file';
  }

  async log(level: 'info' | 'error', event: string, payload: Record<string, unknown> = {}): Promise<void> {
    const redactedPayload = redact(payload);
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, payload: redactedPayload });

    if (this.sink === 'stdout') {
      // eslint-disable-next-line no-console
      console.log(line);
      return;
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${line}\n`, 'utf-8');
  }

  info(event: string, payload: Record<string, unknown> = {}): Promise<void> {
    return this.log('info', event, payload);
  }

  error(event: string, payload: Record<string, unknown> = {}): Promise<void> {
    return this.log('error', event, payload);
  }
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (/authorization|token|secret|password|cookie|apiKey/i.test(key)) {
        return [key, '[redacted]'];
      }
      return [key, redact(entry)];
    })
  );
}
