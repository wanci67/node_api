import cluster from 'node:cluster';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import csrf from 'csurf';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { logger, requestLogger, errorLogger, logStartupBanner, logShutdown, reportMetrics, metricLog } from '../models/logger.js';
import { dynamicRateLimitMiddleware, ipFilterMiddleware } from '../models/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_me';
const WORKERS = Number(process.env.WORKERS || os.cpus().length);
const STATIC_DIR = path.resolve(__dirname, '../web');
const loadedModules = [];

/**
 * 输出环境信息
 */
function logEnvironment() {
  logger.info('环境信息', {
    nodeVersion: process.version,
    platform: process.platform,
    release: os.release(),
    cpus: os.cpus().length,
    memory: os.totalmem(),
  });
}

/**
 * 自动加载apps目录中的模块
 * @param {express.Express} app Express实例
 */
async function loadApps(app) {
  const appsDir = path.resolve(__dirname, '../apps');
  const files = await fs.promises.readdir(appsDir);
  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    const modulePath = path.join(appsDir, file);
    const { default: register } = await import(modulePath);
    if (typeof register === 'function') {
      register(app);
      loadedModules.push({ modulePath, loadedAt: Date.now() });
      logger.info('加载应用模块', { modulePath });
    }
  }
}

/**
 * 配置Session存储策略
 */
function createSessionConfig() {
  return {
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    },
  };
}

/**
 * 注册全局事件处理
 */
function registerGlobalHandlers() {
  process.on('uncaughtException', (error) => {
    logger.error('未捕获异常', { error: error.message, stack: error.stack });
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('未处理的Promise拒绝', { reason });
  });
}

registerGlobalHandlers();

/**
 * 请求ID中间件
 */
function requestIdMiddleware() {
  return (req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  };
}

/**
 * 构造SSE事件
 * @param {express.Response} res 响应对象
 * @param {any} data 数据
 */
function sendSse(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * 创建Express应用
 */
async function createApp() {
  const app = express();

  // 安全中间件
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*', credentials: true }));
  app.use(compression());
  app.use(cookieParser());
  app.use(session(createSessionConfig()));
  app.use(csrf({ cookie: true }));

  // 日志与安全
  app.use(requestIdMiddleware());
  app.use(requestLogger({ captureHeaders: true }));
  app.use(ipFilterMiddleware());
  app.use(dynamicRateLimitMiddleware());

  // 静态文件
  if (fs.existsSync(STATIC_DIR)) {
    app.use('/web', express.static(STATIC_DIR));
  }

  // API模块
  await loadApps(app);

  // 健康检查
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      pid: process.pid,
      uptime: process.uptime(),
      worker: cluster.isPrimary ? 'primary' : 'worker',
    });
  });

  // 模块列表
  app.get('/health/modules', (req, res) => {
    res.json({ modules: loadedModules });
  });

  // 系统信息
  app.get('/health/metrics', (req, res) => {
    const metrics = {
      loadavg: os.loadavg(),
      freemem: os.freemem(),
      totalmem: os.totalmem(),
      uptime: process.uptime(),
      pid: process.pid,
    };
    reportMetrics(metrics);
    res.json(metrics);
  });

  // SSE实时指标
  app.get('/health/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const timer = setInterval(() => {
      const payload = {
        timestamp: Date.now(),
        pid: process.pid,
        memory: process.memoryUsage(),
        cpu: os.loadavg()[0],
      };
      sendSse(res, payload);
    }, 3000);
    req.on('close', () => {
      clearInterval(timer);
    });
  });

  // 错误处理
  app.use(errorLogger());
  app.use((req, res) => {
    res.status(404).json({ message: '接口不存在', requestId: req.requestId });
  });
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ message: err.message || '服务器内部错误', requestId: req.requestId });
  });

  return app;
}

/**
 * 监听服务器事件
 * @param {http.Server} server HTTP服务器
 */
function attachServerEvents(server) {
  server.on('error', (error) => {
    logger.error('服务器错误', { error: error.message });
  });
  server.on('close', () => {
    logShutdown();
  });
}

/**
 * 计算进程指标
 */
function collectWorkerMetrics() {
  const usage = process.memoryUsage();
  return {
    pid: process.pid,
    uptime: process.uptime(),
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    external: usage.external,
    cpuLoad: os.loadavg()[0],
  };
}

/**
 * 启动工作进程
 */
async function startWorker() {
  const app = await createApp();
  const server = http.createServer(app);
  attachServerEvents(server);
  server.listen(PORT, () => {
    logger.info('工作进程启动成功', { pid: process.pid, port: PORT });
  });

  // worker 心跳
  setInterval(() => {
    const metrics = collectWorkerMetrics();
    process.send?.({ type: 'heartbeat', metrics });
  }, 5000);

  process.on('SIGTERM', () => {
    logger.info('收到SIGTERM，准备关闭');
    server.close(() => {
      logShutdown();
      process.exit(0);
    });
  });
}

/**
 * 主进程监控
 */
function setupPrimaryMonitor() {
  const workerStats = new Map();
  cluster.on('message', (worker, message) => {
    if (message.type === 'heartbeat') {
      workerStats.set(worker.id, { ...message.metrics, updatedAt: Date.now() });
      metricLog('worker_heartbeat', 1, { workerId: worker.id, pid: message.metrics.pid });
    }
  });
  setInterval(() => {
    const now = Date.now();
    const summary = Array.from(workerStats.entries()).map(([id, metrics]) => ({
      id,
      ...metrics,
      delay: now - metrics.updatedAt,
    }));
    logger.info('工作进程心跳', { summary });
  }, 10000);
}

/**
 * 启动集群
 */
async function bootstrap() {
  if (cluster.isPrimary) {
    logStartupBanner();
    logEnvironment();
    logger.info('主进程启动', { pid: process.pid, workers: WORKERS });
    for (let i = 0; i < WORKERS; i += 1) {
      cluster.fork();
    }
    cluster.on('exit', (worker, code) => {
      logger.warn('工作进程退出', { pid: worker.process.pid, code });
      cluster.fork();
    });
    setupPrimaryMonitor();
  } else {
    await startWorker();
  }
}

bootstrap();

