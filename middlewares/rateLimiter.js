import { consume, getCurrentPoints } from '../models/rateLimiter.js';

/**
 * @returns {import('express').RequestHandler} 动态限流中间件
 */
export const dynamicRateLimiter = () => async (req, res, next) => {
  try {
    await consume(req.ip);
    res.setHeader('X-RateLimit-Limit', getCurrentPoints());
    next();
  } catch (error) {
    res.setHeader('Retry-After', 5);
    res.status(429).json({ message: '请求过于频繁，请稍后再试' });
  }
};

export default dynamicRateLimiter;
