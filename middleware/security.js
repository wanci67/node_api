import { logger } from '../utils/logger.js';

// 安全相关中间件：IP黑名单、UA检测、API Key验证
export function securityMiddleware(config) {
  return (req, res, next) => {
    const ip = (req.ip || '').replace('::ffff:', '');
    const ua = (req.headers['user-agent'] || '').toLowerCase();

    // 黑名单拦截
    if (config.blacklist && config.blacklist.includes(ip)) {
      logger.info(`黑名单拦截: ${ip}`);
      return res.status(403).json({ error: 'IP被禁止访问' });
    }

    // 高危UA检测
    if (config.highRiskUAs && config.highRiskUAs.some(s => ua.includes(s.toLowerCase()))) {
      logger.info(`高危UA拦截: ${ua}`);
      return res.status(403).json({ error: 'UA被禁止访问' });
    }

    // API Key验证
    if (config.enableApiKey) {
      const key = req.headers['x-api-key'];
      if (key !== config.apiKey) {
        logger.info(`密钥验证失败: ${ip}`);
        return res.status(401).json({ error: '密钥无效' });
      }
    }

    next();
  };
}
