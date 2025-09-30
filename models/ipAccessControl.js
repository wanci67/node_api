import { v4 as uuidv4 } from 'uuid';
import { getRedisClient } from './redisClient.js';
import { logInfo } from './logger.js';

const BLACKLIST_KEY = 'security:blacklist';
const WHITELIST_KEY = 'security:whitelist';
const MALICIOUS_AGENT_KEY = 'security:ua:blacklist';

const suspiciousAgents = [/curl/i, /wget/i, /python-requests/i, /scrapy/i, /httpclient/i];

/**
 * @returns {Promise<Set<string>>} 获取黑名单集合
 */
const fetchSet = async (key) => {
  const redis = getRedisClient();
  if (redis.status !== 'ready') {
    return new Set();
  }
  const members = await redis.smembers(key);
  return new Set(members);
};

/**
 * @param {string} ip 需要加入的IP
 */
export const addToBlacklist = async (ip) => {
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    await redis.sadd(BLACKLIST_KEY, ip);
    logInfo('IP已加入黑名单', { ip });
  }
};

/**
 * @param {string} ip 需要移除的IP
 */
export const removeFromBlacklist = async (ip) => {
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    await redis.srem(BLACKLIST_KEY, ip);
  }
};

/**
 * @param {string} ip 需要检查的IP
 * @returns {Promise<boolean>} 是否在白名单
 */
export const isWhiteListed = async (ip) => {
  const whitelist = await fetchSet(WHITELIST_KEY);
  return whitelist.has(ip);
};

/**
 * @param {string} ip 需要检查的IP
 * @returns {Promise<boolean>} 是否在黑名单
 */
export const isBlacklisted = async (ip) => {
  const blacklist = await fetchSet(BLACKLIST_KEY);
  return blacklist.has(ip);
};

/**
 * @param {string} userAgent UA字符串
 * @returns {Promise<boolean>} 是否为恶意UA
 */
export const isMaliciousAgent = async (userAgent = '') => {
  if (!userAgent) {
    return false;
  }
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    const exists = await redis.sismember(MALICIOUS_AGENT_KEY, userAgent);
    if (exists) {
      return true;
    }
  }
  return suspiciousAgents.some((pattern) => pattern.test(userAgent));
};

/**
 * @param {string} userAgent UA字符串
 */
export const addMaliciousAgent = async (userAgent) => {
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    await redis.sadd(MALICIOUS_AGENT_KEY, userAgent);
    logInfo('恶意UA已加入黑名单', { userAgent });
  }
};

/**
 * @param {string} ip 来源IP
 * @param {Record<string, any>} meta 元信息
 */
export const autoBlacklist = async (ip, meta = {}) => {
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    const flagId = `security:blacklist:flag:${uuidv4()}`;
    await redis.multi().set(flagId, JSON.stringify({ ip, meta }), 'EX', 86400).sadd(BLACKLIST_KEY, ip).exec();
    logInfo('检测到恶意IP，已自动加入黑名单', { ip, meta });
  }
};

export default {
  addToBlacklist,
  removeFromBlacklist,
  isWhiteListed,
  isBlacklisted,
  isMaliciousAgent,
  addMaliciousAgent,
  autoBlacklist,
};
