import express from 'express';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { securityMiddleware } from './middleware/security.js';
import { loadMiddleware } from './middleware/load.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取配置文件
const configPath = path.join(__dirname, 'config', 'config.yaml');
const config = yaml.load(fs.readFileSync(configPath, 'utf8'));

const app = express();
app.set('json spaces', 2); // 输出美化

// 记录路由调用次数
const routeCount = {};

// API日志记录与计数
app.use((req, res, next) => {
  res.on('finish', () => {
    const ip = (req.ip || '').replace('::ffff:', '');
    const logMsg = `${req.method} ${req.originalUrl} ${res.statusCode} ${ip}`;
    logger.api(logMsg);
    const key = req.route ? req.route.path : req.path;
    routeCount[key] = (routeCount[key] || 0) + 1;
  });
  next();
});

// 中间件：系统负载与安全验证
app.use(loadMiddleware(config.load));
app.use(securityMiddleware(config.security));

// 自动加载apps目录中的路由
const appsDir = path.join(__dirname, 'apps');
async function loadRoutes() {
  const files = fs.readdirSync(appsDir);
  for (const file of files) {
    if (file.endsWith('.js')) {
      const module = await import(`./apps/${file}`);
      app.use(module.default);
    }
  }
}
await loadRoutes();

// 统计接口
app.get('/stats', (req, res) => {
  res.json(routeCount);
});

// 根路由
app.get('/', (req, res) => {
  res.json({ message: 'API服务运行中' });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error(`${req.method} ${req.originalUrl} ${err.message}`);
  res.status(500).json({ error: '服务器内部错误' });
});

// 启动服务器
const port = config.server.port;
app.listen(port, () => {
  logger.info(`服务已启动，端口:${port}`);
  console.log(`Server running on port ${port}`);
});
