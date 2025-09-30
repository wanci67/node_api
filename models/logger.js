import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createLogger, format, transports } from 'winston';

/**
 * 日志文件目录常量，使用常量便于后续维护
 */
const LOG_DIR = path.resolve(process.cwd(), 'logs');

/**
 * 文件大小上限，单位字节，超过后自动拆分
 */
const MAX_LOG_FILE_SIZE = 5 * 1024 * 1024;

/**
 * 同步检查日志目录是否存在，不存在则创建
 */
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

ensureLogDir();

/**
 * 格式化日志时间，输出更易读的时间字符串
 * @returns {string} 返回当前时间字符串
 */
function createTimestamp() {
  return new Date().toISOString();
}

/**
 * 生成日志文件名，按照日志类型区分不同文件
 * @param {string} channel 日志类型
 * @returns {string} 文件路径
 */
function buildLogFile(channel) {
  return path.join(LOG_DIR, `${channel}.log`);
}

/**
 * 根据运行环境决定日志输出级别
 * @returns {string} 日志级别
 */
function detectLogLevel() {
  return process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
}

/**
 * 为日志补充上下文信息
 * @param {Record<string, any>} context 上下文
 * @returns {Record<string, any>} 增强后的上下文
 */
function enrichContext(context = {}) {
  return {
    hostname: os.hostname(),
    pid: process.pid,
    env: process.env.NODE_ENV || 'development',
    ...context,
  };
}

/**
 * 构造日志格式，包含时间、级别、消息和上下文
 */
const commonFormat = format.combine(
  format.timestamp({ format: createTimestamp }),
  format.errors({ stack: true }),
  format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
  format.printf((info) => {
    const { timestamp, level, message, metadata } = info;
    const context = metadata && Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${context ? ` ${context}` : ''}`;
  }),
);

/**
 * 创建常规日志记录器，负责输出到控制台和文件
 */
const coreLogger = createLogger({
  level: detectLogLevel(),
  format: commonFormat,
  transports: [
    new transports.Console({
      handleExceptions: true,
    }),
    new transports.File({
      filename: buildLogFile('application'),
      maxsize: MAX_LOG_FILE_SIZE,
      handleExceptions: true,
    }),
  ],
  exitOnError: false,
});

/**
 * 创建安全日志记录器，专门记录安全相关事件
 */
const securityLogger = createLogger({
  level: 'info',
  format: commonFormat,
  transports: [
    new transports.File({
      filename: buildLogFile('security'),
      maxsize: MAX_LOG_FILE_SIZE,
      handleExceptions: true,
    }),
  ],
});

/**
 * 创建审计日志记录器，记录关键操作轨迹
 */
const auditLogger = createLogger({
  level: 'info',
  format: commonFormat,
  transports: [
    new transports.File({
      filename: buildLogFile('audit'),
      maxsize: MAX_LOG_FILE_SIZE,
      handleExceptions: true,
    }),
  ],
});

/**
 * 根据上下文输出常规日志
 * @param {string} level 日志级别
 * @param {string} message 日志内容
 * @param {Record<string, any>} context 上下文
 */
function log(level, message, context = {}) {
  coreLogger.log(level, message, enrichContext(context));
}

/**
 * 输出安全事件日志
 * @param {string} message 日志内容
 * @param {Record<string, any>} context 上下文
 */
function logSecurity(message, context = {}) {
  securityLogger.info(message, enrichContext(context));
}

/**
 * 输出审计日志
 * @param {string} message 日志内容
 * @param {Record<string, any>} context 上下文
 */
function logAudit(message, context = {}) {
  auditLogger.info(message, enrichContext(context));
}

/**
 * 请求日志中间件选项
 * @typedef {Object} RequestLogOptions
 * @property {boolean} captureHeaders 是否记录请求头
 * @property {boolean} captureQuery 是否记录查询参数
 * @property {boolean} captureBody 是否记录请求体
 */

/**
 * 默认的请求日志选项
 */
const defaultRequestOptions = {
  captureHeaders: false,
  captureQuery: true,
  captureBody: false,
};

/**
 * 请求日志中间件
 * @param {RequestLogOptions} options 中间件选项
 * @returns {import('express').RequestHandler} Express中间件
 */
export function requestLogger(options = {}) {
  const merged = { ...defaultRequestOptions, ...options };
  return (req, res, next) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] || `${process.pid}-${start}-${Math.random()}`;
    res.locals.requestId = requestId;
    const baseContext = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };

    if (merged.captureHeaders) {
      baseContext.headers = req.headers;
    }
    if (merged.captureQuery) {
      baseContext.query = req.query;
    }
    if (merged.captureBody && req.body && Object.keys(req.body).length > 0) {
      baseContext.body = req.body;
    }

    log('info', '收到新请求', baseContext);

    res.on('finish', () => {
      const duration = Date.now() - start;
      log('info', '请求完成', {
        ...baseContext,
        statusCode: res.statusCode,
        duration,
        responseSize: res.get('content-length'),
      });
    });

    res.on('close', () => {
      if (!res.writableEnded) {
        log('warn', '客户端提前关闭连接', {
          ...baseContext,
        });
      }
    });

    next();
  };
}

/**
 * 统一错误日志中间件
 * @returns {import('express').ErrorRequestHandler}
 */
export function errorLogger() {
  return (err, req, res, next) => {
    const context = {
      requestId: res.locals.requestId,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      body: req.body,
      query: req.query,
      params: req.params,
    };
    log('error', err.message, {
      ...context,
      stack: err.stack,
    });
    next(err);
  };
}

/**
 * 审计记录辅助函数，便于外部模块调用
 * @param {string} actor 操作者
 * @param {string} action 操作描述
 * @param {Record<string, any>} detail 操作详情
 */
export function writeAuditLog(actor, action, detail = {}) {
  logAudit('审计事件', {
    actor,
    action,
    detail,
  });
}

/**
 * 安全事件记录辅助函数
 * @param {string} event 事件名称
 * @param {Record<string, any>} detail 事件详情
 */
export function writeSecurityLog(event, detail = {}) {
  logSecurity(event, detail);
}

/**
 * 核心日志导出，方便外部直接使用
 */
export const logger = {
  debug(message, context) {
    log('debug', message, context);
  },
  info(message, context) {
    log('info', message, context);
  },
  warn(message, context) {
    log('warn', message, context);
  },
  error(message, context) {
    log('error', message, context);
  },
  requestLogger,
  errorLogger,
  writeAuditLog,
  writeSecurityLog,
};

/**
 * 将日志作为Promise写入，确保异步流程可控
 * @param {string} level 日志级别
 * @param {string} message 日志内容
 * @param {Record<string, any>} context 上下文
 * @returns {Promise<void>} Promise对象
 */
export function logAsync(level, message, context) {
  return new Promise((resolve) => {
    log(level, message, context);
    resolve();
  });
}

/**
 * 生成统计日志内容，方便运营团队分析
 * @param {string} label 标签
 * @param {number} value 数值
 * @param {Record<string, any>} extra 额外信息
 */
export function metricLog(label, value, extra = {}) {
  log('info', `指标: ${label}`, { value, ...extra });
}

/**
 * 返回当前日志配置，用于调试和展示
 * @returns {Record<string, any>} 配置信息
 */
export function describeConfiguration() {
  return {
    level: detectLogLevel(),
    directory: LOG_DIR,
    maxFileSize: MAX_LOG_FILE_SIZE,
    transports: coreLogger.transports.map((transport) => transport.name),
  };
}

/**
 * 针对长时间运行的任务提供日志上下文辅助
 * @param {string} jobName 任务名称
 * @returns {{start: () => void, end: (status: string) => void}} 控制器
 */
export function createJobLogger(jobName) {
  const context = {
    jobName,
    startTime: Date.now(),
  };
  return {
    start() {
      log('info', `任务 ${jobName} 开始执行`, context);
    },
    end(status) {
      const duration = Date.now() - context.startTime;
      log('info', `任务 ${jobName} 执行结束`, {
        ...context,
        status,
        duration,
      });
    },
  };
}

/**
 * 根据传入的请求上下文生成审计描述
 * @param {import('express').Request} req 请求对象
 * @param {string} action 行为描述
 * @param {Record<string, any>} payload 负载
 */
export function auditFromRequest(req, action, payload = {}) {
  writeAuditLog(req.user?.id || 'anonymous', action, {
    ip: req.ip,
    url: req.originalUrl,
    method: req.method,
    payload,
  });
}

/**
 * 在系统启动时输出基础信息，方便排查
 */
export function logStartupBanner() {
  const banner = [
    '=======================================',
    '   Secure Node.js API Service Booting',
    '=======================================',
  ];
  banner.forEach((line) => log('info', line));
  log('info', '日志配置', describeConfiguration());
}

/**
 * 输出系统指标，用于对接APM工具
 * @param {Record<string, any>} metrics 指标信息
 */
export function reportMetrics(metrics) {
  metricLog('system_metrics', 1, metrics);
}

/**
 * 导出通用的日志接口，便于其他模块引用
 */
export default logger;

/**
 * 将日志模块设计成可测试的形式，通过注入不同的传输层实现单元测试
 */
export function createTestLogger(customTransports = []) {
  return createLogger({
    level: 'debug',
    format: commonFormat,
    transports: customTransports,
  });
}

/**
 * 从日志文件中读取最新的N行，便于排查问题
 * @param {string} channel 日志频道
 * @param {number} lines 行数
 * @returns {Promise<string[]>} 返回最新日志内容
 */
export async function tailLog(channel, lines = 50) {
  const file = buildLogFile(channel);
  try {
    const content = await fs.promises.readFile(file, 'utf-8');
    const splitted = content.trim().split('\n');
    return splitted.slice(-lines);
  } catch (error) {
    log('warn', '读取日志文件失败', { channel, error: error.message });
    return [];
  }
}

/**
 * 删除旧日志，防止磁盘占满
 * @param {number} keepDays 保留天数
 */
export async function pruneOldLogs(keepDays = 30) {
  const threshold = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const files = await fs.promises.readdir(LOG_DIR);
  await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(LOG_DIR, file);
      const stats = await fs.promises.stat(filePath);
      if (stats.mtimeMs < threshold) {
        await fs.promises.unlink(filePath);
        log('info', '删除旧日志文件', { file });
      }
    }),
  );
}

/**
 * 手动写入结构化安全日志，提供更多安全监控手段
 * @param {string} message 日志消息
 * @param {Record<string, any>} context 日志上下文
 */
export function recordSecurityEvent(message, context = {}) {
  logSecurity(message, context);
}

/**
 * 把日志接口暴露给进程间通信使用
 * @returns {{notify: (msg: string, ctx?: Record<string, any>) => void}}
 */
export function createProcessMessenger() {
  return {
    notify(msg, ctx) {
      log('info', msg, ctx);
    },
  };
}

/**
 * 记录依赖状态，确保系统启动时检查依赖可用性
 * @param {Record<string, any>} dependencies 依赖状态
 */
export function recordDependencyState(dependencies) {
  log('info', '依赖检查结果', dependencies);
}

/**
 * 针对防火墙或入侵检测系统的接口封装
 * @param {string} subsystem 子系统
 * @param {string} message 信息
 * @param {Record<string, any>} detail 详情
 */
export function logIntrusion(subsystem, message, detail = {}) {
  logSecurity(`入侵监测-${subsystem}`, { message, ...detail });
}

/**
 * 使用自定义标签方便ELK等集中式日志平台检索
 * @param {string} tag 标签
 * @param {string} message 信息
 * @param {Record<string, any>} context 上下文
 */
export function logWithTag(tag, message, context = {}) {
  log('info', message, { tag, ...context });
}

/**
 * 在系统停机时输出结束标记
 */
export function logShutdown() {
  log('info', '系统即将关闭', { pid: process.pid, time: createTimestamp() });
}

/**
 * 导出供其他模块直接使用的审计常量
 */
export const AUDIT_ACTIONS = {
  LOGIN: 'user_login',
  LOGOUT: 'user_logout',
  REFRESH_TOKEN: 'refresh_token',
  UPDATE_PROFILE: 'update_profile',
  CREATE_KEY: 'create_access_key',
  REVOKE_KEY: 'revoke_access_key',
  ACCESS_SENSITIVE_INTERFACE: 'access_sensitive_interface',
};

/**
 * 根据请求上下文生成简洁描述
 * @param {import('express').Request} req 请求
 * @returns {string} 描述
 */
export function summarizeRequest(req) {
  return `${req.method} ${req.originalUrl} from ${req.ip}`;
}

/**
 * 将日志导出到APM系统
 * @param {string} message 信息
 * @param {Record<string, any>} tags 标签
 */
export function forwardToApm(message, tags = {}) {
  log('debug', 'APM转发', { message, tags });
}

/**
 * 针对不同模块提供专属日志记录器，避免混淆
 * @param {string} moduleName 模块名
 * @returns {Record<string, (message: string, context?: Record<string, any>) => void>} 模块化日志接口
 */
export function createModuleLogger(moduleName) {
  return {
    debug(message, context) {
      log('debug', message, { moduleName, ...context });
    },
    info(message, context) {
      log('info', message, { moduleName, ...context });
    },
    warn(message, context) {
      log('warn', message, { moduleName, ...context });
    },
    error(message, context) {
      log('error', message, { moduleName, ...context });
    },
  };
}

/**
 * 立即刷新日志缓冲区
 * @returns {Promise<void>} Promise对象
 */
export async function flushLogs() {
  await Promise.all(
    coreLogger.transports.map(
      (transportInstance) =>
        new Promise((resolve) => {
          transportInstance.on('finish', resolve);
          transportInstance.end();
        }),
    ),
  );
}

/**
 * 将日志模块暴露给全局，以便在调试过程中直接访问
 */
if (!global.__APP_LOGGER__) {
  global.__APP_LOGGER__ = logger;
}

