import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';
import { query } from './mysqlPool.js';
import { getRedisClient } from './redisClient.js';
import { generateApiKey } from './securityTokens.js';
import { logAudit } from './logger.js';

const KEY_TABLE = 'api_keys';

const keySchema = Joi.object({
  userId: Joi.string().required(),
  label: Joi.string().max(100).required(),
  permissions: Joi.array().items(Joi.string()).default([]),
  expiresAt: Joi.date().optional(),
  type: Joi.string().valid('time', 'count').default('time'),
  maxUsage: Joi.number().integer().positive().default(0),
});

/**
 * @param {object} payload 创建参数
 * @returns {Promise<{id:string,apiKey:string}>} 新建记录
 */
export const createKey = async (payload) => {
  const value = await keySchema.validateAsync(payload);
  const apiKey = generateApiKey();
  const id = uuidv4();
  await query(
    `INSERT INTO ${KEY_TABLE} (id, user_id, label, api_key, permissions, expires_at, type, max_usage)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      value.userId,
      value.label,
      apiKey,
      JSON.stringify(value.permissions),
      value.expiresAt ? new Date(value.expiresAt) : null,
      value.type,
      value.maxUsage,
    ],
  );
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    await redis.set(`keys:${apiKey}`, JSON.stringify({ id, ...value }), 'EX', 3600);
  }
  logAudit('创建API密钥', { userId: value.userId, keyId: id });
  return { id, apiKey };
};

/**
 * @param {string} apiKey 密钥字符串
 * @returns {Promise<any>} 密钥详情
 */
export const findKey = async (apiKey) => {
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    const cached = await redis.get(`keys:${apiKey}`);
    if (cached) {
      return JSON.parse(cached);
    }
  }
  const rows = await query(
    `SELECT id, user_id AS userId, label, api_key AS apiKey, permissions, expires_at AS expiresAt, type, max_usage AS maxUsage FROM ${KEY_TABLE} WHERE api_key = ?`,
    [apiKey],
  );
  const key = rows[0];
  if (key && redis.status === 'ready') {
    await redis.set(`keys:${apiKey}`, JSON.stringify(key), 'EX', 3600);
  }
  return key;
};

/**
 * @param {string} id 密钥ID
 * @returns {Promise<void>}
 */
export const revokeKey = async (id) => {
  const rows = await query(`SELECT api_key AS apiKey FROM ${KEY_TABLE} WHERE id = ?`, [id]);
  const key = rows[0];
  await query(`UPDATE ${KEY_TABLE} SET revoked = 1 WHERE id = ?`, [id]);
  if (key) {
    const redis = getRedisClient();
    if (redis.status === 'ready') {
      await redis.del(`keys:${key.apiKey}`);
    }
  }
  logAudit('撤销API密钥', { keyId: id });
};

export default {
  createKey,
  findKey,
  revokeKey,
};
