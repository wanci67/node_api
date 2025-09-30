import { Router } from 'express';
import Joi from 'joi';
import { success, failure } from '../../utils/response.js';
import { findUserByUsername, verifyPassword } from '../../services/userService.js';
import { issueToken, COOKIE_TOKEN_NAME, generateRequestToken } from '../../models/securityTokens.js';
import { recordAudit } from '../../models/auditTrail.js';
import validate from '../../middlewares/validation.js';
import { storeRequestToken } from '../../models/requestTokens.js';

const router = Router();

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

router.post('/login', validate(loginSchema), async (req, res) => {
  const user = await findUserByUsername(req.body.username);
  if (!user) {
    await recordAudit({
      action: 'LOGIN_FAILED',
      userId: null,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      detail: { reason: 'USER_NOT_FOUND', username: req.body.username },
    });
    return failure(res, '用户名或密码错误', 401);
  }
  const isMatch = verifyPassword(req.body.password, user.passwordHash);
  if (!isMatch) {
    await recordAudit({
      action: 'LOGIN_FAILED',
      userId: user.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      detail: { reason: 'PASSWORD_NOT_MATCH' },
    });
    return failure(res, '用户名或密码错误', 401);
  }
  const token = issueToken({ id: user.id, role: user.role });
  res.cookie(COOKIE_TOKEN_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  const requestToken = generateRequestToken();
  await storeRequestToken(requestToken, user.id);
  await recordAudit({
    action: 'LOGIN_SUCCESS',
    userId: user.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    detail: { requestToken },
  });
  return success(res, { token, requestToken });
});

router.post('/logout', async (req, res) => {
  res.clearCookie(COOKIE_TOKEN_NAME);
  success(res, { message: '退出成功' });
});

export default {
  id: 'auth',
  name: '身份认证',
  desc: '提供登录、退出、请求令牌等身份认证服务。',
  status: 'normal',
  link: './Interfaces.html#auth',
  basePath: '/auth',
  router,
};
