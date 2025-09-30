import { logInfo } from '../models/logger.js';
import { recordAudit } from '../models/auditTrail.js';

/**
 * @returns {import('express').RequestHandler} 请求日志中间件
 */
export const requestLogger = () => async (req, res, next) => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || `${Date.now()}-${Math.random()}`;
  res.locals.requestId = requestId;
  res.on('finish', () => {
    const duration = Date.now() - start;
    const context = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      duration,
    };
    logInfo('HTTP请求完成', context);
  });
  try {
    await recordAudit({
      action: 'REQUEST_RECEIVED',
      userId: res.locals.user?.id || null,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      detail: { method: req.method, url: req.originalUrl, requestId },
    });
  } catch (error) {
    // 审计记录失败不影响主流程
  }
  next();
};

export default requestLogger;
