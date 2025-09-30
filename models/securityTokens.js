import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';

const COOKIE_TOKEN_NAME = 'secure_token';

/**
 * @param {Record<string, any>} payload 用户载荷
 * @param {string} expiresIn 过期时间
 * @returns {string} 签发的JWT
 */
export const issueToken = (payload, expiresIn = '2h') =>
  jwt.sign(payload, config.jwtSecret, { expiresIn, algorithm: 'HS512' });

/**
 * @param {string} token JWT字符串
 * @returns {Record<string, any>} 解码后的数据
 */
export const verifyToken = (token) => jwt.verify(token, config.jwtSecret);

/**
 * @param {Record<string, any>} payload 签名载荷
 * @returns {string} HMAC签名
 */
export const signPayload = (payload) => {
  const content = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', process.env.SIGNATURE_SECRET || config.signatureSecret)
    .update(content)
    .digest('hex');
};

/**
 * @param {Record<string, any>} payload 签名载荷
 * @param {string} signature 对比签名
 * @returns {boolean} 是否匹配
 */
export const verifySignature = (payload, signature) => {
  const expected = signPayload(payload);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

/**
 * @returns {string} 生成随机API密钥
 */
export const generateApiKey = () => crypto.randomBytes(24).toString('base64url');

/**
 * @returns {string} 生成接口调用Token
 */
export const generateRequestToken = () => crypto.randomBytes(32).toString('base64url');

export default {
  issueToken,
  verifyToken,
  signPayload,
  verifySignature,
  generateApiKey,
  generateRequestToken,
  COOKIE_TOKEN_NAME,
};
