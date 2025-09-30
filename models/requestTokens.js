import { getRedisClient } from './redisClient.js';

const PREFIX = 'request-token:';

/**
 * @param {string} token 请求令牌
 * @param {string} userId 用户ID
 * @returns {Promise<void>}
 */
export const storeRequestToken = async (token, userId) => {
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    await redis.set(`${PREFIX}${token}`, userId, 'EX', 3600);
  }
};

/**
 * @param {string} token 请求令牌
 * @returns {Promise<string|null>} 关联用户
 */
export const verifyRequestToken = async (token) => {
  const redis = getRedisClient();
  if (redis.status !== 'ready') {
    return null;
  }
  const userId = await redis.get(`${PREFIX}${token}`);
  return userId;
};

export default {
  storeRequestToken,
  verifyRequestToken,
};
