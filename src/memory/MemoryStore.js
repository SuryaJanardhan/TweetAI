import fs from 'node:fs/promises';
import path from 'node:path';

const MEMORY_TYPES = ['working', 'episodic', 'semantic', 'performance', 'strategic'];

export class MemoryStore {
  constructor(basePath = path.resolve(process.cwd(), 'data', 'memory')) {
    this.basePath = basePath;
  }

  async initialize() {
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

  pathFor(type) {
    if (!MEMORY_TYPES.includes(type)) {
      throw new Error(`Unsupported memory type: ${type}`);
    }
    return path.join(this.basePath, `${type}.json`);
  }

  async add(type, entry) {
    const records = await this.get(type);
    const next = [...records, { ...entry, timestamp: new Date().toISOString() }];
    await fs.writeFile(this.pathFor(type), JSON.stringify(next, null, 2));
    return next[next.length - 1];
  }

  async get(type) {
    const text = await fs.readFile(this.pathFor(type), 'utf-8');
    return JSON.parse(text);
  }

  async similaritySearch(type, query) {
    const rows = await this.get(type);
    const needle = query.toLowerCase();
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
  }
}
