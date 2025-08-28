import os from 'os';
import { logger } from '../utils/logger.js';

// 系统负载检查中间件
export function loadMiddleware(config) {
  return (req, res, next) => {
    const cpus = os.cpus().length;
    const cpuLoad = os.loadavg()[0] / cpus; // 1分钟平均负载
    const memoryLoad = 1 - os.freemem() / os.totalmem();

    // 记录负载信息
    logger.info(`CPU负载:${cpuLoad.toFixed(2)} 内存占用:${(memoryLoad * 100).toFixed(0)}%`);

    // 根据负载限制访问
    if (cpuLoad > config.cpuThreshold || memoryLoad > config.memoryThreshold) {
      return res.status(503).json({ error: '系统繁忙，请稍后再试' });
    }
    next();
  };
}
