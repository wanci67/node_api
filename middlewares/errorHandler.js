import { logError } from '../models/logger.js';
import { recordAudit } from '../models/auditTrail.js';

/**
 * @returns {import('express').ErrorRequestHandler} 统一错误处理
 */
export const errorHandler = () => async (err, req, res, next) => {
  const status = err.status || 500;
  const response = {
    message: err.message || '服务器内部错误',
    requestId: res.locals.requestId,
  };
  logError(err, {
    status,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    requestId: res.locals.requestId,
    body: req.body,
  });
  try {
    await recordAudit({
      action: 'REQUEST_ERROR',
      userId: res.locals.user?.id || null,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      detail: { status, message: err.message, requestId: res.locals.requestId },
    });
  } catch (auditError) {
    logError(auditError, { component: 'errorHandler.audit', requestId: res.locals.requestId });
  }
  res.status(status).json(response);
};

export default errorHandler;
