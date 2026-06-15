import fs from 'node:fs/promises';
import path from 'node:path';
import { query, isDbConnected } from '../db/index.js';

const MEMORY_TYPES = ['working', 'episodic', 'semantic', 'performance', 'strategic'] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];
type MemoryRecord = Record<string, unknown>;
type DependencyStatus = { status: 'ok' } | { status: 'error'; message: string };

export class MemoryStore {
  basePath: string;

  constructor(basePath = path.resolve(process.cwd(), 'data', 'memory')) {
    this.basePath = basePath;
  }

  async initialize(): Promise<void> {
    if (isDbConnected()) {
      return;
    }
    await fs.mkdir(this.basePath, { recursive: true });
    await Promise.all(
      MEMORY_TYPES.map(async (type) => {
        const p = this.pathFor(type);
        try {
          await fs.access(p);
        } catch {
          await fs.writeFile(p, JSON.stringify([], null, 2));
        }
      })
    );
  }

  pathFor(type: string): string {
    if (!isMemoryType(type)) {
      throw new Error(`Unsupported memory type: ${type}`);
    }
    return path.join(this.basePath, `${type}.json`);
  }

  async add(type: string, entry: MemoryRecord): Promise<MemoryRecord> {
    if (isDbConnected()) {
      const timestampedEntry = { ...entry, timestamp: new Date().toISOString() };
      const res = await query(
        'INSERT INTO memory (type, entry) VALUES ($1, $2) RETURNING entry',
        [type, JSON.stringify(timestampedEntry)]
      );
      return res.rows[0].entry as MemoryRecord;
    }

    const records = await this.get(type);
    const next = [...records, { ...entry, timestamp: new Date().toISOString() }];
    await fs.writeFile(this.pathFor(type), JSON.stringify(next, null, 2));
    return next[next.length - 1];
  }

  async get(type: string): Promise<MemoryRecord[]> {
    if (isDbConnected()) {
      const res = await query('SELECT entry FROM memory WHERE type = $1 ORDER BY id ASC', [type]);
      return res.rows.map((row) => row.entry as MemoryRecord);
    }

    const text = await fs.readFile(this.pathFor(type), 'utf-8');
    return JSON.parse(text) as MemoryRecord[];
  }

  async similaritySearch(type: string, queryText: string): Promise<MemoryRecord[]> {
    if (isDbConnected()) {
      const needle = `%${queryText.toLowerCase()}%`;
      const res = await query(
        'SELECT entry FROM memory WHERE type = $1 AND LOWER(entry::text) LIKE $2 ORDER BY id ASC',
        [type, needle]
      );
      return res.rows.map((row) => row.entry as MemoryRecord);
    }

    const rows = await this.get(type);
    const needle = queryText.toLowerCase();
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
  }

  async dependencyStatus(): Promise<DependencyStatus> {
    if (isDbConnected()) {
      try {
        await query('SELECT 1');
        return { status: 'ok' };
      } catch (error) {
        return { status: 'error', message: error instanceof Error ? error.message : 'Database query test failed' };
      }
    }

    try {
      await Promise.all(MEMORY_TYPES.map((type) => fs.access(this.pathFor(type))));
      return { status: 'ok' };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : 'Unknown dependency error' };
    }
  }
}

function isMemoryType(type: string): type is MemoryType {
  return (MEMORY_TYPES as readonly string[]).includes(type);
}
