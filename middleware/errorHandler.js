const { logRequestError } = require('../models/logger');
const { recordAuditEvent } = require('../models/audit');

/**
 * @param {Error} err 错误对象
 * @param {import('express').Request} req 请求对象
 * @param {import('express').Response} res 响应对象
 * @param {import('express').NextFunction} next 下一步
 * @returns {void}
 */
const errorHandler = (err, req, res, next) => {
  logRequestError(req, err, 'global');
  recordAuditEvent({
    action: 'screenshot',
    status: 'failure',
    reason: err.message,
    ip: req.ip,
  });

  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(500).json({
    success: false,
    message: '服务内部异常',
  });
};

module.exports = errorHandler;
