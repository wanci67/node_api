import Redis from 'ioredis';
import { logError, logInfo } from './logger.js';

/** @type {Redis | null} */
let client = null;

/**
 * @returns {Redis} Redis客户端实例
 */
export const getRedisClient = () => {
  if (!client) {
    client = new Redis({
      host: process.env.REDIS_HOST,
      port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });

    client.on('error', (error) => {
      logError(error, { component: 'redisClient' });
    });

    client.on('ready', () => {
      logInfo('Redis连接已就绪', { component: 'redisClient' });
    });

    client.connect().catch((error) => {
      logError(error, { component: 'redisClient', phase: 'connect' });
    });
  }
  return client;
};

export default {
  getRedisClient,
};
