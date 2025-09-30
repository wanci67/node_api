import Joi from 'joi';
import { verifyToken } from '../models/securityTokens.js';
import { findKey } from '../models/keyManager.js';
import { getAuthorizationCode } from '../models/authorizationCode.js';
import { verifyRequestToken } from '../models/requestTokens.js';
import { findUserById } from '../services/userService.js';

const headerSchema = Joi.object({
  authorization: Joi.string().pattern(/^Bearer\s.+/).optional(),
  'x-api-key': Joi.string().optional(),
  'x-request-sign': Joi.string().required(),
  'x-request-timestamp': Joi.string().required(),
  'x-request-token': Joi.string().optional(),
  'x-authorization-code': Joi.string().optional(),
}).unknown(true);

/**
 * @returns {import('express').RequestHandler} 认证中间件
 */
export const authenticate = () => async (req, res, next) => {
  try {
    const headers = await headerSchema.validateAsync(req.headers);
    const bearer = headers.authorization || req.cookies?.secure_token;
    if (bearer) {
      const token = bearer.replace('Bearer ', '');
      res.locals.user = verifyToken(token);
    }
    if (headers['x-request-token']) {
      const userId = await verifyRequestToken(headers['x-request-token']);
      if (!userId) {
        return res.status(401).json({ message: '请求令牌无效' });
      }
      if (res.locals.user && res.locals.user.id !== userId) {
        return res.status(401).json({ message: '请求令牌与身份不匹配' });
      }
      if (!res.locals.user) {
        const user = await findUserById(userId);
        if (!user) {
          return res.status(401).json({ message: '用户不存在' });
        }
        res.locals.user = user;
      }
      res.locals.requestTokenUser = userId;
    }
    if (headers['x-api-key']) {
      const key = await findKey(headers['x-api-key']);
      if (!key) {
        return res.status(401).json({ message: 'API密钥无效' });
      }
      res.locals.apiKey = key;
    }
    if (headers['x-authorization-code']) {
      const code = await getAuthorizationCode(headers['x-authorization-code']);
      if (!code) {
        return res.status(401).json({ message: '授权码无效' });
      }
      const expireTime = new Date(code.expirationTime || 0).getTime();
      if (Date.now() > expireTime || code.status?.code !== 'ok') {
        return res.status(403).json({ message: '授权码不可用' });
      }
      res.locals.authorizationCode = code;
    }
    next();
  } catch (error) {
    next({ status: 401, message: '认证信息错误' });
  }
};

export default authenticate;
