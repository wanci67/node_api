import NodeCache from 'node-cache';
import config from '../config/env.js';
import { getRedisClient } from './redisClient.js';

const memoryCache = new NodeCache({ stdTTL: config.cacheTTLSeconds, checkperiod: 120 });

/**
 * @param {string} key 缓存键
 * @param {any} value 缓存值
 * @param {number} ttlSeconds 生存时间
 */
export const setCache = async (key, value, ttlSeconds = config.cacheTTLSeconds) => {
  memoryCache.set(key, value, ttlSeconds);
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
};

/**
 * @param {string} key 缓存键
 * @returns {Promise<any | null>} 缓存内容
 */
export const getCache = async (key) => {
  const memoryValue = memoryCache.get(key);
  if (memoryValue !== undefined) {
    return memoryValue;
  }
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    const raw = await redis.get(key);
    if (raw) {
      const value = JSON.parse(raw);
      memoryCache.set(key, value, config.cacheTTLSeconds);
      return value;
    }
  }
  return null;
};

/**
 * @param {string} key 缓存键
 */
export const deleteCache = async (key) => {
  memoryCache.del(key);
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    await redis.del(key);
  }
};

export default {
  setCache,
  getCache,
  deleteCache,
};
