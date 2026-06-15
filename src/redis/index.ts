import { Redis } from 'ioredis';
import { loadConfig } from '../config.js';

const config = loadConfig();
let redisConnection: Redis | null = null;

const redisUrl = config.redisUrl;

if (redisUrl && redisUrl !== 'your_redis_url_here') {
  redisConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null
  });
}

export function getRedisConnection(): Redis | null {
  return redisConnection;
}

export function isRedisConnected(): boolean {
  return redisConnection !== null;
}

export async function closeRedisConnection() {
  if (redisConnection) {
    await redisConnection.quit();
  }
}
