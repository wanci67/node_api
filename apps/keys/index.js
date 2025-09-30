import { Router } from 'express';
import Joi from 'joi';
import { success, failure } from '../../utils/response.js';
import { createKey } from '../../models/keyManager.js';
import { getAuthorizationCode } from '../../models/authorizationCode.js';
import { getRedisClient } from '../../models/redisClient.js';
import requireRole from '../../middlewares/roleGuard.js';
import validate from '../../middlewares/validation.js';

const router = Router();

router.use(requireRole(['user', 'admin']));

const createSchema = Joi.object({
  label: Joi.string().required(),
  permissions: Joi.array().items(Joi.string()).default([]),
  expiresAt: Joi.date().optional(),
  type: Joi.string().valid('time', 'count').required(),
  maxUsage: Joi.number().integer().min(0).default(0),
  authorization: Joi.string().required(),
});

router.post('/', validate(createSchema), async (req, res) => {
  const user = res.locals.user;
  const redis = getRedisClient();
  const authorization = await getAuthorizationCode(req.body.authorization);
  if (!authorization) {
    return failure(res, '授权码不存在或已失效', 403);
  }
  if (authorization.userId && authorization.userId !== user.id) {
    return failure(res, '授权码不属于当前用户', 403);
  }
  const expireTime = new Date(authorization.expirationTime || 0).getTime();
  if (Date.now() > expireTime || authorization.status.code !== 'ok') {
    return failure(res, '授权码不可用', 403);
  }
  if (redis.status === 'ready') {
    const usageKey = `authorization:${authorization.authorization}:usage`;
    const activeKey = `authorization:${authorization.authorization}:active`;
    const usage = Number.parseInt((await redis.get(usageKey)) || '0', 10);
    const active = await redis.scard(activeKey);
    if (usage >= authorization.max) {
      return failure(res, '授权码创建次数已达上限', 429);
    }
    if (active >= authorization.time) {
      return failure(res, '授权码可用密钥数量已达上限', 429);
    }
    await redis.set(usageKey, usage + 1, 'EX', 86400);
  }
  const payload = {
    userId: user.id,
    label: req.body.label,
    permissions: req.body.permissions,
    expiresAt: req.body.expiresAt,
    type: req.body.type,
    maxUsage: req.body.maxUsage,
  };
  const key = await createKey(payload);
  if (redis.status === 'ready') {
    await redis.sadd(`authorization:${authorization.authorization}:active`, key.id);
  }
  success(res, key, 201);
});

export default {
  id: 'keys',
  name: '密钥管理',
  desc: '为授权用户生成、管理接口访问密钥。',
  status: 'normal',
  link: './Interfaces.html#keys',
  basePath: '/keys',
  router,
};
