import dotenv from 'dotenv';

dotenv.config();

/**
 * @typedef {Object} AppConfig
 * @property {string} nodeEnv 当前运行环境
 * @property {number} port 服务端口
 * @property {string} host 服务绑定主机
 * @property {string} jwtSecret JWT签名密钥
 * @property {string} signatureSecret 请求签名密钥
 * @property {number} rateLimitBase 基础限流速率
 * @property {number} rateLimitMax 最大限流速率
 * @property {number} cacheTTLSeconds 默认缓存时间
 */

/**
 * @returns {AppConfig} 标准化后的环境配置
 */
export const loadConfig = () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number.parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'change_me_jwt',
  signatureSecret: process.env.SIGNATURE_SECRET || 'change_me_signature',
  rateLimitBase: Number.parseInt(process.env.RATE_LIMIT_BASE || '200', 10),
  rateLimitMax: Number.parseInt(process.env.RATE_LIMIT_MAX || '2000', 10),
  cacheTTLSeconds: Number.parseInt(process.env.CACHE_TTL_SECONDS || '60', 10)
});

export default loadConfig();
