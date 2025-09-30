const rateLimit = require('express-rate-limit');

/**
 * @returns {import('express-rate-limit').RateLimitRequestHandler} 通用限流器
 */
const createGlobalLimiter = () =>
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX || 120),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: '请求过于频繁，请稍后再试',
    },
  });

/**
 * @returns {import('express-rate-limit').RateLimitRequestHandler} 截图接口专用限流器
 */
const createScreenshotLimiter = () =>
  rateLimit({
    windowMs: Number(process.env.SCREENSHOT_RATE_WINDOW_MS || 60 * 1000),
    max: Number(process.env.SCREENSHOT_RATE_MAX || 30),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: '截图请求过多，请稍后重试',
    },
  });

module.exports = {
  globalLimiter: createGlobalLimiter(),
  screenshotLimiter: createScreenshotLimiter(),
};
