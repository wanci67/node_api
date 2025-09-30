const cluster = require('cluster');
const os = require('os');
const dotenv = require('dotenv');
const http = require('http');
const app = require('./apps/systemApp');
const { logger } = require('./models/logger');
const renderer = require('./models/renderer');
require('./models/apm');

dotenv.config();

const PORT = process.env.PORT || 3000;

if (cluster.isPrimary) {
  const cpuCount = Number(process.env.CLUSTER_WORKERS || os.cpus().length);
  logger.info('主进程启动，准备派生工作进程', { cpuCount });
  for (let i = 0; i < cpuCount; i += 1) {
    cluster.fork();
  }
  cluster.on('exit', (worker) => {
    logger.warn('工作进程退出，即将重启', { pid: worker.process.pid });
    cluster.fork();
  });
} else {
  const server = http.createServer(app);
  server.listen(PORT, () => {
    logger.info('截图服务已启动', { pid: process.pid, port: PORT });
  });

  const shutdown = async () => {
    logger.info('工作进程准备关闭', { pid: process.pid });
    await renderer.shutdown();
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
