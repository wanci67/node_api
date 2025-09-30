import Joi from 'joi';
import crypto from 'crypto';
import config from '../config/env.js';

const schema = Joi.object({
  'x-request-sign': Joi.string().required(),
  'x-request-timestamp': Joi.string().required(),
}).unknown(true);

/**
 * @returns {import('express').RequestHandler} 请求签名校验
 */
export const signatureValidator = () => async (req, res, next) => {
  try {
    const headers = await schema.validateAsync(req.headers);
    const timestamp = Number.parseInt(headers['x-request-timestamp'], 10);
    if (Number.isNaN(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
      return res.status(400).json({ message: '请求时间戳无效' });
    }
    const payload = `${req.method}\n${req.originalUrl}\n${timestamp}\n${JSON.stringify(req.body || {})}`;
    const secret = headers['x-request-token']
      ? headers['x-request-token']
      : config.signatureSecret;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(headers['x-request-sign']))) {
      return res.status(401).json({ message: '签名校验失败' });
    }
    next();
  } catch (error) {
    res.status(401).json({ message: '请求签名错误' });
  }
};

export default signatureValidator;
