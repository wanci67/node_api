import express from 'express';
import Joi from 'joi';
import compression from 'compression';
import apicache from 'apicache';
import { v4 as uuidv4 } from 'uuid';
import { createModuleLogger, AUDIT_ACTIONS, auditFromRequest } from '../models/logger.js';
import {
  createClientSignature,
  createUserToken,
  flagSuspiciousRequest,
  tokenMiddleware,
  apiKeyMiddleware,
  statisticsMiddleware,
  queryStatistics,
  apiKeyManager,
} from '../models/security.js';
import {
  query,
  cachedQuery,
  insert,
  update,
  remove,
  cacheStats,
  initializeStorage,
  resetCache,
} from '../models/storage.js';

const router = express.Router();
const cache = apicache.middleware;
const moduleLogger = createModuleLogger('systemApp');

/**
 * 初始化数据库结构
 */
async function ensureSchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(64) UNIQUE,
      password VARCHAR(128),
      role VARCHAR(32),
      created_at BIGINT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  await query(
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      actor VARCHAR(64),
      action VARCHAR(128),
      detail JSON,
      created_at BIGINT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
}

await ensureSchema();
await initializeStorage();

/**
 * 注册请求中间件
 */
router.use(express.json({ limit: '1mb' }));
router.use(express.urlencoded({ extended: false }));
router.use(compression());

/**
 * 内部工具函数：保存审计日志
 * @param {string} actor 操作者
 * @param {string} action 行为
 * @param {Record<string, any>} detail 详情
 */
async function saveAudit(actor, action, detail) {
  await insert('audit_logs', {
    actor,
    action,
    detail: JSON.stringify(detail),
    created_at: Date.now(),
  });
}

/**
 * 登录接口
 */
router.post('/auth/login', async (req, res) => {
  const schema = Joi.object({
    username: Joi.string().alphanum().min(4).max(32).required(),
    password: Joi.string().min(8).required(),
  });
  try {
    const payload = await schema.validateAsync(req.body);
    const users = await cachedQuery('SELECT * FROM users WHERE username = ?', [payload.username]);
    const user = users[0];
    if (!user || user.password !== payload.password) {
      await flagSuspiciousRequest(
        {
          ip: req.ip,
          userAgent: req.get('user-agent'),
        },
        '登录失败',
      );
      res.status(401).json({ message: '用户名或密码错误' });
      return;
    }
    const token = createUserToken({ id: user.id, role: user.role, username: user.username });
    res.cookie('token', token, { httpOnly: true, secure: true });
    await saveAudit(user.username, AUDIT_ACTIONS.LOGIN, { ip: req.ip });
    auditFromRequest(req, AUDIT_ACTIONS.LOGIN, { username: user.username });
    res.json({ token });
  } catch (error) {
    moduleLogger.error('登录接口错误', { error: error.message });
    res.status(400).json({ message: '请求参数错误' });
  }
});

/**
 * 创建用户接口
 */
router.post('/auth/register', async (req, res) => {
  const schema = Joi.object({
    username: Joi.string().alphanum().min(4).max(32).required(),
    password: Joi.string().min(8).required(),
    role: Joi.string().valid('admin', 'user').default('user'),
  });
  try {
    const payload = await schema.validateAsync(req.body);
    const user = {
      id: uuidv4(),
      username: payload.username,
      password: payload.password,
      role: payload.role,
      created_at: Date.now(),
    };
    await insert('users', user);
    await saveAudit(user.username, 'user_register', {});
    res.json({ id: user.id });
  } catch (error) {
    moduleLogger.error('注册接口错误', { error: error.message });
    res.status(400).json({ message: '注册失败' });
  }
});

/**
 * 接口密钥管理
 */
router.post('/auth/keys', tokenMiddleware(), async (req, res) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    type: Joi.string().valid('time', 'quota').required(),
    ttl: Joi.number().integer().min(60).default(3600),
    quota: Joi.number().integer().min(1).default(100),
    enabled: Joi.boolean().default(true),
  });
  try {
    const payload = await schema.validateAsync(req.body);
    const key = await apiKeyManager.create(payload);
    await saveAudit(req.user.username, AUDIT_ACTIONS.CREATE_KEY, key);
    res.json(key);
  } catch (error) {
    moduleLogger.error('创建密钥失败', { error: error.message });
    res.status(400).json({ message: '创建密钥失败' });
  }
});

router.delete('/auth/keys/:key', tokenMiddleware(), async (req, res) => {
  try {
    await apiKeyManager.revoke(req.params.key);
    await saveAudit(req.user.username, AUDIT_ACTIONS.REVOKE_KEY, { key: req.params.key });
    res.json({ message: '密钥已撤销' });
  } catch (error) {
    res.status(400).json({ message: '撤销失败' });
  }
});

/**
 * 健康检查
 */
router.get('/system/health', cache('5 seconds'), async (req, res) => {
  const stats = cacheStats();
  res.json({
    status: 'ok',
    cache: stats,
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

/**
 * 重置缓存
 */
router.post('/system/cache/reset', tokenMiddleware(), async (req, res) => {
  await resetCache();
  await saveAudit(req.user.username, 'cache_reset', {});
  res.json({ message: '缓存已重置' });
});

/**
 * 查询接口统计
 */
router.get('/system/stats', tokenMiddleware(), async (req, res) => {
  const schema = Joi.object({ path: Joi.string().required() });
  try {
    const { path } = await schema.validateAsync(req.query);
    const stats = await queryStatistics(path);
    res.json(stats || {});
  } catch (error) {
    res.status(400).json({ message: '查询失败' });
  }
});

/**
 * 示例业务接口，需要签名验证但不需要密钥
 */
router.post(
  '/business/secure-action',
  tokenMiddleware(),
  statisticsMiddleware('/business/secure-action'),
  async (req, res) => {
    const schema = Joi.object({
      data: Joi.string().required(),
    });
    try {
      const payload = await schema.validateAsync(req.body);
      await saveAudit(req.user.username, 'secure_action', payload);
      res.json({ message: '操作成功', payload });
    } catch (error) {
      res.status(400).json({ message: '参数错误' });
    }
  },
);

/**
 * 示例接口，需要密钥与签名双重验证
 */
router.get(
  '/business/key-required',
  tokenMiddleware(),
  apiKeyMiddleware('/business/key-required'),
  statisticsMiddleware('/business/key-required'),
  async (req, res) => {
    const schema = Joi.object({
      id: Joi.string().required(),
    });
    try {
      const payload = await schema.validateAsync(req.query);
      const data = await cachedQuery('SELECT * FROM users WHERE id = ?', [payload.id], 30);
      res.json({ data });
    } catch (error) {
      res.status(400).json({ message: '查询失败' });
    }
  },
);

/**
 * 管理端接口：更新用户
 */
router.put('/admin/users/:id', tokenMiddleware(), async (req, res) => {
  const schema = Joi.object({
    role: Joi.string().valid('admin', 'user'),
    password: Joi.string().min(8),
  });
  try {
    const payload = await schema.validateAsync(req.body);
    await update('users', payload, 'id = ?', [req.params.id]);
    await saveAudit(req.user.username, AUDIT_ACTIONS.UPDATE_PROFILE, { userId: req.params.id, payload });
    res.json({ message: '更新成功' });
  } catch (error) {
    res.status(400).json({ message: '更新失败' });
  }
});

/**
 * 管理端接口：删除用户
 */
router.delete('/admin/users/:id', tokenMiddleware(), async (req, res) => {
  try {
    await remove('users', 'id = ?', [req.params.id]);
    await saveAudit(req.user.username, 'user_delete', { id: req.params.id });
    res.json({ message: '删除成功' });
  } catch (error) {
    res.status(400).json({ message: '删除失败' });
  }
});

/**
 * 获取客户端签名示例
 */
router.post('/client/signature', tokenMiddleware(), async (req, res) => {
  const schema = Joi.object({
    payload: Joi.object().required(),
  });
  try {
    const { payload } = await schema.validateAsync(req.body);
    const signature = createClientSignature(payload);
    res.json(signature);
  } catch (error) {
    res.status(400).json({ message: '生成失败' });
  }
});

/**
 * 审计日志查询
 */
router.get('/admin/audit-logs', tokenMiddleware(), async (req, res) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
  });
  try {
    const { page, pageSize } = await schema.validateAsync(req.query);
    const offset = (page - 1) * pageSize;
    const rows = await query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?', [pageSize, offset]);
    res.json({ rows });
  } catch (error) {
    res.status(400).json({ message: '查询失败' });
  }
});

/**
 * 注入测试用漏洞检测接口，模拟SQL注入防护
 */
router.post('/security/sql-check', tokenMiddleware(), async (req, res) => {
  const schema = Joi.object({
    statement: Joi.string().max(200).required(),
  });
  try {
    const { statement } = await schema.validateAsync(req.body);
    if (/;|--|\bOR\b|\bAND\b|\bDROP\b/i.test(statement)) {
      await flagSuspiciousRequest(
        {
          ip: req.ip,
          userAgent: req.get('user-agent'),
        },
        'SQL注入尝试',
      );
      res.status(400).json({ message: '检测到潜在注入语句' });
      return;
    }
    res.json({ message: '语句安全' });
  } catch (error) {
    res.status(400).json({ message: '校验失败' });
  }
});

/**
 * CC攻击模拟接口
 */
router.get(
  '/security/cc-test',
  tokenMiddleware(),
  statisticsMiddleware('/security/cc-test'),
  async (req, res) => {
    const count = await cachedQuery('SELECT COUNT(*) as total FROM users');
    res.json({ total: count[0]?.total || 0 });
  },
);

/**
 * 安全事件上报
 */
router.post('/security/report', tokenMiddleware(), async (req, res) => {
  const schema = Joi.object({
    type: Joi.string().required(),
    detail: Joi.object().required(),
  });
  try {
    const payload = await schema.validateAsync(req.body);
    moduleLogger.warn('客户端安全事件', payload);
    res.json({ message: '已记录' });
  } catch (error) {
    res.status(400).json({ message: '上报失败' });
  }
});

/**
 * 关键业务操作审计
 */
router.post('/business/critical-action', tokenMiddleware(), async (req, res) => {
  const schema = Joi.object({
    action: Joi.string().required(),
    target: Joi.string().required(),
  });
  try {
    const payload = await schema.validateAsync(req.body);
    await saveAudit(req.user.username, AUDIT_ACTIONS.ACCESS_SENSITIVE_INTERFACE, payload);
    res.json({ message: '审计已记录' });
  } catch (error) {
    res.status(400).json({ message: '处理失败' });
  }
});

/**
 * 导出路由和元信息
 */
export function register(app) {
  app.use('/api/v1', router);
  moduleLogger.info('系统应用已注册');
}

export default register;

