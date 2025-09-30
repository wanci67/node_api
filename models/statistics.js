import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRedisClient } from './redisClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jsonPath = path.join(__dirname, '..', 'data', 'api-interfaces.json');

const REDIS_PREFIX = 'statistics:api:';

/**
 * @param {string} apiId 接口ID
 * @returns {Promise<void>}
 */
export const registerApi = async (apiId) => {
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    const key = `${REDIS_PREFIX}${apiId}`;
    await redis.hsetnx(key, 'calls', 0);
    await redis.hsetnx(key, 'success', 0);
    await redis.hsetnx(key, 'fail', 0);
  }
};

/**
 * @param {string} apiId 接口ID
 * @param {boolean} success 是否成功
 * @param {string} ip 请求来源IP
 * @returns {Promise<void>}
 */
export const recordCall = async (apiId, success, ip) => {
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    const key = `${REDIS_PREFIX}${apiId}`;
    await redis
      .multi()
      .hincrby(key, 'calls', 1)
      .hincrby(key, success ? 'success' : 'fail', 1)
      .sadd(`${key}:ips`, ip)
      .exec();
  }
};

/**
 * @param {Array<{id:string,name:string,desc:string,status:string,link:string}>} metas 元数据
 * @returns {Promise<void>} 生成接口描述JSON
 */
export const generateJson = async (metas) => {
  const redis = getRedisClient();
  const enriched = await Promise.all(
    metas.map(async (meta) => {
      const key = `${REDIS_PREFIX}${meta.id}`;
      let calls = 0;
      let successCount = 0;
      let failCount = 0;
      let ipCount = 0;
      if (redis.status === 'ready') {
        const stats = await redis.hgetall(key);
        calls = Number.parseInt(stats.calls || '0', 10);
        successCount = Number.parseInt(stats.success || '0', 10);
        failCount = Number.parseInt(stats.fail || '0', 10);
        ipCount = await redis.scard(`${key}:ips`);
      }
      const successRate = calls > 0 ? successCount / calls : 1;
      const failRate = calls > 0 ? failCount / calls : 0;
      return {
        ...meta,
        calls,
        success: Number.parseFloat(successRate.toFixed(3)),
        fail: Number.parseFloat(failRate.toFixed(3)),
        ipCount,
      };
    }),
  );
  try {
    await fs.writeFile(jsonPath, JSON.stringify(enriched, null, 2), 'utf-8');
  } catch (error) {
    // 写入失败不影响主流程
  }
};

export default {
  registerApi,
  recordCall,
  generateJson,
};
