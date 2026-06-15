import { query, isDbConnected } from '../db/index.js';
import { getRedisConnection, isRedisConnected } from '../redis/index.js';

export async function cleanupTestStorage() {
  if (isDbConnected()) {
    try {
      await query('TRUNCATE TABLE jobs, memory, audit_logs CASCADE;');
    } catch (err) {
      // Ignore if tables are not initialized yet
    }
  }
  if (isRedisConnected()) {
    try {
      const redis = getRedisConnection()!;
      await redis.del(
        'safety:twitter:daily',
        'safety:twitter:hourly',
        'safety:twitter:rolling15m',
        'safety:twitter:burst1m'
      );
      
      // Clear BullMQ keys
      const keys = await redis.keys('*orchestration-jobs*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (err) {
      // Ignore Redis errors during test cleanup
    }
  }
}

export async function closeTestConnections() {
  try {
    const { closePool } = await import('../db/index.js');
    await closePool();
  } catch (err) {
    // Ignore
  }
  try {
    const { closeRedisConnection } = await import('../redis/index.js');
    await closeRedisConnection();
  } catch (err) {
    // Ignore
  }
  setTimeout(() => {
    // Safely exit the test process after connections are closed
    process.exit(0);
  }, 500).unref();
}
