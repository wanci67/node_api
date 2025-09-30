import path from 'path';
import { fileURLToPath } from 'url';
import winston from 'winston';
import 'winston-daily-rotate-file';
import config from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logDir = path.join(__dirname, '..', 'logs');

/**
 * @type {winston.Logform.Format} 自定义日志格式，包含时间戳与上下文
 */
const logFormat = winston.format.printf(({ level, message, timestamp, context = {} }) => {
  const contextString = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
  return `${timestamp} [${level.toUpperCase()}] ${message}${contextString}`;
});

/**
 * @returns {winston.Logger} 持久化的Winston日志实例
 */
const buildLogger = () => {
  const transports = [
    new winston.transports.Console({
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.splat(),
        logFormat,
      ),
    }),
    new winston.transports.DailyRotateFile({
      dirname: logDir,
      filename: '%DATE%-application.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '50m',
      maxFiles: '30d',
      level: 'info',
      format: winston.format.combine(winston.format.timestamp(), logFormat),
    }),
    new winston.transports.DailyRotateFile({
      dirname: logDir,
      filename: '%DATE%-error.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '50m',
      maxFiles: '60d',
      level: 'error',
      format: winston.format.combine(winston.format.timestamp(), logFormat),
    }),
    new winston.transports.DailyRotateFile({
      dirname: logDir,
      filename: '%DATE%-audit.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '50m',
      maxFiles: '180d',
      level: 'info',
      format: winston.format.combine(winston.format.timestamp(), logFormat),
    }),
  ];

  return winston.createLogger({
    level: 'info',
    transports,
    defaultMeta: { service: 'secure-node-api' },
  });
};

const logger = buildLogger();

/**
 * @param {string} message 日志内容
 * @param {Record<string, any>} context 业务上下文
 */
export const logInfo = (message, context = {}) => {
  logger.info(message, { context });
};

/**
 * @param {Error|string} error 错误信息
 * @param {Record<string, any>} context 业务上下文
 */
export const logError = (error, context = {}) => {
  const message = error instanceof Error ? error.stack || error.message : error;
  logger.error(message, { context });
};

/**
 * @param {string} message 审计日志内容
 * @param {Record<string, any>} context 审计上下文
 */
export const logAudit = (message, context = {}) => {
  logger.log({ level: 'info', message: `[AUDIT] ${message}`, context });
};

export default logger;
