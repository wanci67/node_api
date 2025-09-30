const { createLogger, format, transports } = require('winston');
const path = require('path');

/**
 * @returns {import('winston').Logger} 一个带有中文注释的结构化日志记录器
 */
const buildLogger = () => {
  const logLevel = process.env.LOG_LEVEL || 'info';
  return createLogger({
    level: logLevel,
    format: format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      format.errors({ stack: true }),
      format.splat(),
      format.json(),
    ),
    defaultMeta: { service: 'screenshot-service' },
    transports: [
      new transports.Console({ handleExceptions: true }),
      new transports.File({
        filename: path.resolve(process.env.LOG_DIR || 'storage', 'combined.log'),
        handleExceptions: true,
      }),
    ],
  });
};

const logger = buildLogger();

/**
 * @param {import('express').Request} req Express 请求对象
 * @param {Error} error 错误对象
 * @param {string} stage 当前处理阶段
 * @returns {void}
 */
const logRequestError = (req, error, stage) => {
  logger.error('请求处理异常', {
    stage,
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    headers: req.headers,
    body: req.body,
  });
};

/**
 * @param {import('express').Request} req Express 请求对象
 * @param {number} durationMs 耗时（毫秒）
 * @param {object} extra 附加信息
 * @returns {void}
 */
const logPerformance = (req, durationMs, extra = {}) => {
  logger.info('渲染耗时统计', {
    url: req.originalUrl,
    method: req.method,
    durationMs,
    ip: req.ip,
    ...extra,
  });
};

module.exports = {
  logger,
  logRequestError,
  logPerformance,
};
