import Joi from 'joi';
import { query } from './mysqlPool.js';
import { logAudit } from './logger.js';

const TABLE = 'audit_logs';

const schema = Joi.object({
  action: Joi.string().required(),
  userId: Joi.string().allow(null),
  ip: Joi.string().ip({ version: ['ipv4', 'ipv6'] }).allow(null),
  userAgent: Joi.string().allow(null),
  detail: Joi.object().default({}),
});

/**
 * @param {object} payload 审计内容
 * @returns {Promise<void>}
 */
export const recordAudit = async (payload) => {
  const value = await schema.validateAsync(payload);
  await query(
    `INSERT INTO ${TABLE} (action, user_id, ip, user_agent, detail)
     VALUES (?, ?, ?, ?, ?)`,
    [
      value.action,
      value.userId,
      value.ip,
      value.userAgent,
      JSON.stringify(value.detail || {}),
    ],
  );
  logAudit(value.action, value);
};

export default {
  recordAudit,
};
