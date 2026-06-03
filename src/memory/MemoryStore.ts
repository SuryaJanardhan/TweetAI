import fs from 'node:fs/promises';
import path from 'node:path';

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
    const records = await this.get(type);
    const next = [...records, { ...entry, timestamp: new Date().toISOString() }];
    await fs.writeFile(this.pathFor(type), JSON.stringify(next, null, 2));
    return next[next.length - 1];
  }

  async get(type: string): Promise<MemoryRecord[]> {
    const text = await fs.readFile(this.pathFor(type), 'utf-8');
    return JSON.parse(text) as MemoryRecord[];
  }

  async similaritySearch(type: string, query: string): Promise<MemoryRecord[]> {
    const rows = await this.get(type);
    const needle = query.toLowerCase();
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
  }

  async dependencyStatus(): Promise<DependencyStatus> {
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
