import { Router } from 'express';
import { success } from '../../utils/response.js';
import { collectSystemMetrics } from '../../models/systemMonitor.js';

const router = Router();

router.get('/', async (req, res) => {
  const metrics = collectSystemMetrics();
  success(res, {
    status: 'ok',
    uptime: process.uptime(),
    metrics,
    timestamp: new Date().toISOString(),
  });
});

export default {
  id: 'health',
  name: '健康检查',
  desc: '用于负载均衡和APM的健康检查接口。',
  status: 'normal',
  link: './Interfaces.html#health',
  basePath: '/health',
  router,
};
