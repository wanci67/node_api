import os from 'node:os';
import crypto from 'node:crypto';
import EventEmitter from 'node:events';
import osUtils from 'os-utils';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { createModuleLogger, writeSecurityLog, logIntrusion } from './logger.js';
import { redisCounter, redisGet, redisSet, redisDel, redisEval, buildCacheKey } from './storage.js';

const moduleLogger = createModuleLogger('security');

/**
 * 动态限流策略基础配置
 */
const rateLimitConfig = {
  minLimit: Number(process.env.MIN_RATE_LIMIT || 50),
  maxLimit: Number(process.env.MAX_RATE_LIMIT || 2000),
  recoverStep: 50,
  degradeStep: 100,
  cpuThreshold: 0.7,
  memoryThreshold: 0.75,
  sampleInterval: 3000,
};

/**
 * 签名使用的哈希算法
 */
const SIGN_ALGORITHM = 'sha256';

/**
 * JWT签名密钥
 */
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'change_me_securely';

/**
 * 接口密钥缓存命名空间
 */
const KEY_NAMESPACE = 'api_keys';

/**
 * IP信誉评分存储键
 */
const IP_SCORE_NAMESPACE = 'ip_score';

/**
 * 默认token有效期
 */
const DEFAULT_TOKEN_EXPIRE = 60 * 60;

/**
 * 接口访问统计键
 */
const STATS_NAMESPACE = 'api_stats';

/**
 * 安全事件枚举
 */
export const SECURITY_EVENTS = {
  TOKEN_EXPIRED: 'token_expired',
  TOKEN_INVALID: 'token_invalid',
  SIGNATURE_MISMATCH: 'signature_mismatch',
  RATE_LIMIT_BLOCKED: 'rate_limit_blocked',
  IP_BLACKLISTED: 'ip_blacklisted',
  IP_WHITELISTED: 'ip_whitelisted',
  KEY_REQUIRED: 'key_required',
  KEY_EXPIRED: 'key_expired',
  KEY_LIMIT_REACHED: 'key_limit_reached',
};

/**
 * 黑名单集合键
 */
const BLACKLIST_KEY = 'security:blacklist';

/**
 * 白名单集合键
 */
const WHITELIST_KEY = 'security:whitelist';

/**
 * 动态限流控制器
 */
class DynamicRateLimiter extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.currentLimit = config.maxLimit;
    this.timer = null;
  }

  /**
   * 启动限流监控
   */
  start() {
    this.adjust();
    this.timer = setInterval(() => this.adjust(), this.config.sampleInterval);
  }

  /**
   * 停止限流监控
   */
  stop() {
    clearInterval(this.timer);
  }

  /**
   * 调整限流阈值
   */
  adjust() {
    osUtils.cpuUsage((cpu) => {
      const memory = 1 - os.freemem() / os.totalmem();
      if (cpu > this.config.cpuThreshold || memory > this.config.memoryThreshold) {
        this.currentLimit = Math.max(this.config.minLimit, this.currentLimit - this.config.degradeStep);
        this.emit('degrade', { cpu, memory, limit: this.currentLimit });
      } else {
        this.currentLimit = Math.min(this.config.maxLimit, this.currentLimit + this.config.recoverStep);
        this.emit('recover', { cpu, memory, limit: this.currentLimit });
      }
    });
  }

  /**
   * 获取当前限流阈值
   */
  getLimit() {
    return this.currentLimit;
  }
}

const rateLimiter = new DynamicRateLimiter(rateLimitConfig);
rateLimiter.start();

rateLimiter.on('degrade', (payload) => {
  moduleLogger.warn('限流阈值降低', payload);
});

rateLimiter.on('recover', (payload) => {
  moduleLogger.info('限流阈值恢复', payload);
});

/**
 * 请求上下文信息封装
 * @typedef {Object} SecurityContext
 * @property {string} ip 客户端IP
 * @property {string} userAgent 客户端UA
 * @property {string} token 认证Token
 * @property {string} signature 签名
 * @property {string} timestamp 时间戳
 * @property {string} nonce 随机数
 * @property {string} key API密钥
 */

/**
 * 安全服务类
 */
class SecurityService {
  constructor() {
    this.keyStore = new Map();
    this.signatureWindow = Number(process.env.SIGNATURE_WINDOW || 60);
    this.requestNonceCache = new Map();
  }

  /**
   * 校验签名
   * @param {SecurityContext} context 上下文
   * @param {Record<string, any>} payload 请求体
   */
  validateSignature(context, payload) {
    if (!context.signature || !context.timestamp || !context.nonce) {
      return false;
    }
    const timestamp = Number(context.timestamp);
    if (Number.isNaN(timestamp) || Math.abs(Date.now() - timestamp) > this.signatureWindow * 1000) {
      return false;
    }
    const nonceKey = `${context.nonce}:${context.ip}`;
    if (this.requestNonceCache.has(nonceKey)) {
      return false;
    }
    const sortedPayload = Object.keys(payload || {})
      .sort()
      .map((key) => `${key}=${payload[key]}`)
      .join('&');
    const raw = `${context.timestamp}.${context.nonce}.${sortedPayload}`;
    const hash = crypto.createHmac(SIGN_ALGORITHM, TOKEN_SECRET).update(raw).digest('hex');
    const isValid = hash === context.signature;
    if (isValid) {
      this.requestNonceCache.set(nonceKey, true);
      setTimeout(() => this.requestNonceCache.delete(nonceKey), this.signatureWindow * 1000);
    }
    return isValid;
  }

  /**
   * 生成Token
   * @param {Record<string, any>} payload 载荷
   * @param {number} expiresIn 过期时间
   */
  generateToken(payload, expiresIn = DEFAULT_TOKEN_EXPIRE) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + expiresIn }))
      .toString('base64url');
    const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  /**
   * 验证Token
   * @param {string} token Token字符串
   */
  verifyToken(token) {
    if (!token) {
      return null;
    }
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) {
      writeSecurityLog('无效的Token格式');
      return null;
    }
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${body}`).digest('base64url');
    if (expected !== signature) {
      writeSecurityLog('Token签名不匹配');
      return null;
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp * 1000 < Date.now()) {
      writeSecurityLog('Token已过期');
      return null;
    }
    return payload;
  }

  /**
   * 记录接口统计
   * @param {string} path 路径
   * @param {boolean} success 是否成功
   * @param {string} ip IP地址
   */
  async recordStats(path, success, ip) {
    const key = buildCacheKey(STATS_NAMESPACE, path);
    const stat = (await redisGet(key)) || {
      total: 0,
      success: 0,
      fail: 0,
      ips: new Set(),
    };
    stat.total += 1;
    if (success) {
      stat.success += 1;
    } else {
      stat.fail += 1;
    }
    if (!stat.ips.has) {
      stat.ips = new Set(stat.ips);
    }
    stat.ips.add(ip);
    await redisSet(key, { ...stat, ips: Array.from(stat.ips) }, 3600);
  }

  /**
   * 获取接口统计
   * @param {string} path 路径
   */
  async getStats(path) {
    const key = buildCacheKey(STATS_NAMESPACE, path);
    const stat = await redisGet(key);
    if (!stat) {
      return null;
    }
    const total = stat.total || 0;
    const success = stat.success || 0;
    const fail = stat.fail || 0;
    return {
      total,
      success,
      fail,
      successRate: total === 0 ? 0 : success / total,
      failRate: total === 0 ? 0 : fail / total,
      ipCount: (stat.ips || []).length,
    };
  }

  /**
   * 黑名单校验
   * @param {string} ip IP地址
   */
  async isBlacklisted(ip) {
    const script = `return redis.call('SISMEMBER', KEYS[1], ARGV[1])`;
    const result = await redisEval(script, 1, [BLACKLIST_KEY], [ip]);
    return result === 1;
  }

  /**
   * 白名单校验
   * @param {string} ip IP地址
   */
  async isWhitelisted(ip) {
    const script = `return redis.call('SISMEMBER', KEYS[1], ARGV[1])`;
    const result = await redisEval(script, 1, [WHITELIST_KEY], [ip]);
    return result === 1;
  }

  /**
   * 更新IP信誉
   * @param {string} ip IP地址
   * @param {number} delta 变化
   */
  async adjustIpScore(ip, delta) {
    const key = buildCacheKey(IP_SCORE_NAMESPACE, ip);
    const score = ((await redisGet(key)) || 0) + delta;
    await redisSet(key, score, 3600);
    if (score > 10) {
      await this.blockIp(ip);
    }
    if (score < -5) {
      await this.allowIp(ip);
    }
  }

  /**
   * 加入黑名单
   * @param {string} ip IP地址
   */
  async blockIp(ip) {
    const script = `return redis.call('SADD', KEYS[1], ARGV[1])`;
    await redisEval(script, 1, [BLACKLIST_KEY], [ip]);
    writeSecurityLog('IP加入黑名单', { ip });
  }

  /**
   * 加入白名单
   * @param {string} ip IP地址
   */
  async allowIp(ip) {
    const script = `return redis.call('SADD', KEYS[1], ARGV[1])`;
    await redisEval(script, 1, [WHITELIST_KEY], [ip]);
    writeSecurityLog('IP加入白名单', { ip });
  }

  /**
   * 生成接口密钥
   * @param {Object} options 选项
   */
  async generateKey(options) {
    const schema = Joi.object({
      name: Joi.string().required(),
      type: Joi.string().valid('time', 'quota').required(),
      ttl: Joi.number().integer().min(60).default(3600),
      quota: Joi.number().integer().min(1).default(100),
      enabled: Joi.boolean().default(true),
    });
    const value = await schema.validateAsync(options);
    const key = uuidv4();
    const payload = {
      ...value,
      key,
      createdAt: Date.now(),
      remaining: value.quota,
    };
    await redisSet(buildCacheKey(KEY_NAMESPACE, key), payload, value.type === 'time' ? value.ttl : value.ttl * 10);
    return payload;
  }

  /**
   * 校验接口密钥
   * @param {string} key 密钥
   * @param {string} path 接口
   */
  async validateKey(key, path) {
    if (!key) {
      return { valid: false, reason: SECURITY_EVENTS.KEY_REQUIRED };
    }
    const data = await redisGet(buildCacheKey(KEY_NAMESPACE, key));
    if (!data) {
      return { valid: false, reason: SECURITY_EVENTS.KEY_EXPIRED };
    }
    if (!data.enabled) {
      return { valid: false, reason: SECURITY_EVENTS.KEY_EXPIRED };
    }
    if (data.type === 'quota') {
      if (data.remaining <= 0) {
        return { valid: false, reason: SECURITY_EVENTS.KEY_LIMIT_REACHED };
      }
      data.remaining -= 1;
      await redisSet(buildCacheKey(KEY_NAMESPACE, key), data, 3600);
    }
    writeSecurityLog('密钥验证通过', { key, path });
    return { valid: true, data };
  }

  /**
   * 撤销密钥
   * @param {string} key 密钥
   */
  async revokeKey(key) {
    await redisDel(buildCacheKey(KEY_NAMESPACE, key));
  }

  /**
   * 生成签名
   * @param {Record<string, any>} payload 载荷
   */
  generateSignature(payload) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(8).toString('hex');
    const sortedPayload = Object.keys(payload)
      .sort()
      .map((key) => `${key}=${payload[key]}`)
      .join('&');
    const raw = `${timestamp}.${nonce}.${sortedPayload}`;
    const signature = crypto.createHmac(SIGN_ALGORITHM, TOKEN_SECRET).update(raw).digest('hex');
    return { timestamp, nonce, signature };
  }

  /**
   * 检查限流
   * @param {string} key 键
   */
  async checkRateLimit(key) {
    const limit = rateLimiter.getLimit();
    const count = await redisCounter(`rate:${key}`, 60);
    if (count > limit) {
      writeSecurityLog('触发限流', { key, count, limit });
      return false;
    }
    return true;
  }

  /**
   * 检查UA
   * @param {string} userAgent UA
   */
  isMaliciousUA(userAgent = '') {
    const patterns = [/curl/i, /wget/i, /nikto/i, /sqlmap/i, /kali/i, /acunetix/i];
    return patterns.some((pattern) => pattern.test(userAgent));
  }

  /**
   * 记录可疑请求
   * @param {SecurityContext} context 上下文
   * @param {string} reason 原因
   */
  async handleSuspicious(context, reason) {
    await this.adjustIpScore(context.ip, 2);
    logIntrusion('SECURITY', '检测到可疑请求', { ...context, reason });
  }
}

export const securityService = new SecurityService();

/**
 * Express中间件：动态限流
 */
export function dynamicRateLimitMiddleware() {
  return async (req, res, next) => {
    const key = `${req.ip}:${req.originalUrl}`;
    const allowed = await securityService.checkRateLimit(key);
    if (!allowed) {
      res.status(429).json({ message: '请求过于频繁，请稍后重试' });
      return;
    }
    next();
  };
}

/**
 * Express中间件：黑白名单
 */
export function ipFilterMiddleware() {
  return async (req, res, next) => {
    const ip = req.ip;
    if (await securityService.isWhitelisted(ip)) {
      writeSecurityLog('白名单放行', { ip });
      next();
      return;
    }
    if (await securityService.isBlacklisted(ip)) {
      writeSecurityLog('黑名单拦截', { ip });
      res.status(403).json({ message: 'IP被禁止访问' });
      return;
    }
    if (securityService.isMaliciousUA(req.get('user-agent'))) {
      await securityService.blockIp(ip);
      res.status(403).json({ message: '检测到恶意客户端' });
      return;
    }
    next();
  };
}

/**
 * Express中间件：签名验证
 */
export function signatureMiddleware() {
  return (req, res, next) => {
    const context = {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      signature: req.get('x-signature'),
      timestamp: req.get('x-timestamp'),
      nonce: req.get('x-nonce'),
    };
    if (!securityService.validateSignature(context, req.body || {})) {
      writeSecurityLog('签名验证失败', context);
      res.status(401).json({ message: '签名验证失败' });
      return;
    }
    next();
  };
}

/**
 * Express中间件：Token验证
 */
export function tokenMiddleware() {
  return (req, res, next) => {
    const token = req.cookies?.token || req.get('authorization');
    const payload = securityService.verifyToken(token);
    if (!payload) {
      res.status(401).json({ message: '身份认证失败' });
      return;
    }
    req.user = payload;
    next();
  };
}

/**
 * Express中间件：接口密钥
 */
export function apiKeyMiddleware(path) {
  return async (req, res, next) => {
    const key = req.get('x-api-key');
    const result = await securityService.validateKey(key, path);
    if (!result.valid) {
      res.status(403).json({ message: '接口密钥无效', reason: result.reason });
      return;
    }
    req.apiKey = result.data;
    next();
  };
}

/**
 * Express中间件：接口统计
 */
export function statisticsMiddleware(path) {
  return async (req, res, next) => {
    const start = Date.now();
    res.on('finish', async () => {
      const success = res.statusCode < 400;
      await securityService.recordStats(path, success, req.ip);
      writeSecurityLog('接口统计记录', {
        path,
        status: res.statusCode,
        duration: Date.now() - start,
        success,
      });
    });
    next();
  };
}

/**
 * 导出统计查询函数
 */
export async function queryStatistics(path) {
  return securityService.getStats(path);
}

/**
 * 生成前端使用的签名参数
 */
export function createClientSignature(payload) {
  return securityService.generateSignature(payload);
}

/**
 * 生成用户令牌
 */
export function createUserToken(user) {
  return securityService.generateToken(user);
}

/**
 * 标记可疑请求
 */
export async function flagSuspiciousRequest(context, reason) {
  await securityService.handleSuspicious(context, reason);
}

/**
 * API密钥管理接口
 */
export const apiKeyManager = {
  create: (options) => securityService.generateKey(options),
  revoke: (key) => securityService.revokeKey(key),
};

