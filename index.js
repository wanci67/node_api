import cluster from 'cluster';
import os from 'os';
import process from 'process';
import { createServer } from 'http';
import { createApp } from './app.js';
import config from './config/env.js';
import { logInfo, logError } from './models/logger.js';

const workers = Math.max(1, Math.min(os.cpus().length, 4));

const startWorker = async () => {
  try {
    const app = await createApp();
    const server = createServer(app);
    server.listen(config.port, config.host, () => {
      logInfo('服务启动成功', {
        pid: process.pid,
        port: config.port,
        host: config.host,
      });
    });
    const shutdown = () => {
      logInfo('收到终止信号，准备关闭服务', { pid: process.pid });
      server.close(() => {
        logInfo('服务已关闭', { pid: process.pid });
        process.exit(0);
      });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logError(error, { pid: process.pid, phase: 'worker_start' });
    process.exit(1);
  }
};

if (cluster.isPrimary) {
  logInfo('主进程启动，准备创建工作进程', { pid: process.pid, workers });
  for (let i = 0; i < workers; i += 1) {
    cluster.fork();
  }
  cluster.on('exit', (worker) => {
    logError(`工作进程退出: ${worker.process.pid}`, { event: 'worker_exit' });
    cluster.fork();
  });
} else {
  startWorker();
}
