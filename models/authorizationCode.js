import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { query } from './mysqlPool.js';
import { getRedisClient } from './redisClient.js';
import { logAudit } from './logger.js';

const TABLE = 'authorization_codes';

const schema = Joi.object({
  userId: Joi.string().optional(),
  expirationTime: Joi.date().required(),
  max: Joi.number().integer().positive().required(),
  time: Joi.number().integer().positive().required(),
  status: Joi.object({
    code: Joi.string().required(),
    message: Joi.string().allow(null),
  })
    .required()
    .custom((value, helpers) => {
      if (!['ok', 'disabled', 'expired'].includes(value.code)) {
        return helpers.error('any.invalid');
      }
      return value;
    }),
});

/**
 * @returns {string} 授权码
 */
export const generateAuthorizationCode = () => {
  const prefix = process.env.AUTH_CODE_PREFIX || 'YH-';
  const suffix = uuidv4().replace(/-/g, '').slice(0, 9).toUpperCase();
  return `${prefix}${suffix}`;
};

/**
 * @param {object} payload 创建参数
 * @returns {Promise<{id:string,authorization:string}>}
 */
export const createAuthorizationCode = async (payload) => {
  const value = await schema.validateAsync(payload);
  const authorization = generateAuthorizationCode();
  const id = uuidv4();
  await query(
    `INSERT INTO ${TABLE} (id, authorization, user_id, expiration_time, max_count, max_keys, status_code, status_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      authorization,
      value.userId || null,
      new Date(value.expirationTime),
      value.max,
      value.time,
      value.status.code,
      value.status.message,
    ],
  );
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    await redis.set(
      `authorization:${authorization}`,
      JSON.stringify({ id, authorization, ...value }),
      'EX',
      3600,
    );
  }
  logAudit('生成授权码', { authorization });
  return { id, authorization };
};

/**
 * @param {string} authorization 授权码
 * @returns {Promise<any>} 查询结果
 */
export const getAuthorizationCode = async (authorization) => {
  const redis = getRedisClient();
  if (redis.status === 'ready') {
    const cached = await redis.get(`authorization:${authorization}`);
    if (cached) {
      return JSON.parse(cached);
    }
  }
  const rows = await query(
    `SELECT id, authorization, user_id AS userId, expiration_time AS expirationTime, max_count AS max, max_keys AS time, status_code AS statusCode, status_message AS statusMessage FROM ${TABLE} WHERE authorization = ?`,
    [authorization],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  const normalized = {
    id: row.id,
    authorization: row.authorization,
    userId: row.userId,
    expirationTime: row.expirationTime,
    max: row.max,
    time: row.time,
    status: { code: row.statusCode, message: row.statusMessage },
  };
  if (redis.status === 'ready') {
    await redis.set(`authorization:${authorization}`, JSON.stringify(normalized), 'EX', 3600);
  }
  return normalized;
};

export default {
  createAuthorizationCode,
  getAuthorizationCode,
};
