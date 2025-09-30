import { Router } from 'express';
import Joi from 'joi';
import { success } from '../../utils/response.js';
import { createUser, deactivateUser } from '../../services/userService.js';
import { createKey, revokeKey } from '../../models/keyManager.js';
import { createAuthorizationCode } from '../../models/authorizationCode.js';
import { addToBlacklist, removeFromBlacklist } from '../../models/ipAccessControl.js';
import { recordAudit } from '../../models/auditTrail.js';
import validate from '../../middlewares/validation.js';
import requireRole from '../../middlewares/roleGuard.js';

const router = Router();

router.use(requireRole(['admin']));

const userSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
  role: Joi.string().valid('admin', 'user').default('user'),
  email: Joi.string().email().optional(),
});

router.post('/users', validate(userSchema), async (req, res) => {
  const user = await createUser(req.body);
  await recordAudit({
    action: 'ADMIN_CREATE_USER',
    userId: res.locals.user.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    detail: { targetUser: user.id },
  });
  success(res, user, 201);
});

router.delete('/users/:id', async (req, res) => {
  await deactivateUser(req.params.id);
  await recordAudit({
    action: 'ADMIN_DEACTIVATE_USER',
    userId: res.locals.user.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    detail: { targetUser: req.params.id },
  });
  success(res, { message: '用户已禁用' });
});

const keySchema = Joi.object({
  userId: Joi.string().required(),
  label: Joi.string().required(),
  permissions: Joi.array().items(Joi.string()).default([]),
  expiresAt: Joi.date().optional(),
  type: Joi.string().valid('time', 'count').required(),
  maxUsage: Joi.number().integer().min(0).default(0),
});

router.post('/keys', validate(keySchema), async (req, res) => {
  const result = await createKey(req.body);
  await recordAudit({
    action: 'ADMIN_CREATE_KEY',
    userId: res.locals.user.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    detail: { keyId: result.id },
  });
  success(res, result, 201);
});

router.delete('/keys/:id', async (req, res) => {
  await revokeKey(req.params.id);
  await recordAudit({
    action: 'ADMIN_REVOKE_KEY',
    userId: res.locals.user.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    detail: { keyId: req.params.id },
  });
  success(res, { message: '密钥已撤销' });
});

const authorizationSchema = Joi.object({
  userId: Joi.string().optional(),
  expirationTime: Joi.date().required(),
  max: Joi.number().integer().positive().required(),
  time: Joi.number().integer().positive().required(),
});

router.post('/authorization-codes', validate(authorizationSchema), async (req, res) => {
  const payload = { ...req.body, status: { code: 'ok', message: null } };
  const code = await createAuthorizationCode(payload);
  await recordAudit({
    action: 'ADMIN_CREATE_AUTH_CODE',
    userId: res.locals.user.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    detail: { authorization: code.authorization },
  });
  success(res, code, 201);
});

const blacklistSchema = Joi.object({
  ip: Joi.string().ip({ version: ['ipv4', 'ipv6'] }).required(),
});

router.post('/blacklist', validate(blacklistSchema), async (req, res) => {
  await addToBlacklist(req.body.ip);
  success(res, { message: '已加入黑名单' });
});

router.delete('/blacklist', validate(blacklistSchema), async (req, res) => {
  await removeFromBlacklist(req.body.ip);
  success(res, { message: '已移除黑名单' });
});

export default {
  id: 'admin',
  name: '运维管理',
  desc: '提供用户、密钥、授权码、黑名单等安全运维接口。',
  status: 'normal',
  link: './Interfaces.html#admin',
  basePath: '/admin',
  router,
};
