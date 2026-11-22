import { createClient } from 'redis';

export const redis = createClient({ url: process.env.REDIS_URL });

export async function connectRedis(): Promise<void> {
  redis.on('error', (error) => console.error('Redis error:', error));
  if (!redis.isOpen) await redis.connect();
}
