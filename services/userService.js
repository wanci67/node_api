import Joi from 'joi';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../models/mysqlPool.js';

const userSchema = Joi.object({
  username: Joi.string().alphanum().min(4).max(32).required(),
  password: Joi.string().min(8).max(128).required(),
  role: Joi.string().valid('admin', 'user').default('user'),
  email: Joi.string().email().optional(),
});

/**
 * @param {object} payload 创建参数
 * @returns {Promise<{id:string}>}
 */
export const createUser = async (payload) => {
  const value = await userSchema.validateAsync(payload);
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(value.password, salt, 64).toString('hex');
  const passwordHash = `${salt}:${hash}`;
  const id = uuidv4();
  await query(
    'INSERT INTO users (id, username, password_hash, role, email) VALUES (?, ?, ?, ?, ?)',
    [id, value.username, passwordHash, value.role, value.email || null],
  );
  return { id };
};

/**
 * @param {string} username 用户名
 * @returns {Promise<any>} 用户信息
 */
export const findUserByUsername = async (username) => {
  const rows = await query(
    'SELECT id, username, password_hash AS passwordHash, role FROM users WHERE username = ?',
    [username],
  );
  return rows[0];
};

/**
 * @param {string} password 明文密码
 * @param {string} stored 密文数据
 * @returns {boolean} 是否匹配
 */
export const verifyPassword = (password, stored) => {
  const [salt, hash] = stored.split(':');
  const derived = scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(hash, 'hex');
  return timingSafeEqual(storedBuffer, derived);
};

/**
 * @param {string} id 用户ID
 * @returns {Promise<any>} 用户信息
 */
export const findUserById = async (id) => {
  const rows = await query(
    'SELECT id, username, role FROM users WHERE id = ?',
    [id],
  );
  return rows[0];
};

/**
 * @param {string} id 用户ID
 * @returns {Promise<void>}
 */
export const deactivateUser = async (id) => {
  await query('UPDATE users SET active = 0 WHERE id = ?', [id]);
};

export default {
  createUser,
  findUserByUsername,
  findUserById,
  deactivateUser,
  verifyPassword,
};
