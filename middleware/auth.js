const { recordAuditEvent } = require('../models/audit');
const { logger } = require('../models/logger');

/**
 * @param {import('express').Request} req 请求对象
 * @param {import('express').Response} res 响应对象
 * @param {import('express').NextFunction} next 下一步
 * @returns {void}
 */
const authMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.SCREENSHOT_API_KEY;
  if (!expectedKey || apiKey === expectedKey) {
    next();
    return;
  }

  logger.warn('访问被拒绝，API Key 不匹配', {
    ip: req.ip,
    url: req.originalUrl,
  });

  recordAuditEvent({
    action: 'screenshot-auth',
    status: 'failure',
    reason: 'unauthorized',
    ip: req.ip,
  });

  res.status(401).json({
    success: false,
    message: '未授权的访问',
  });
};

module.exports = authMiddleware;
