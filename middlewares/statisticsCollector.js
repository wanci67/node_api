import { recordCall } from '../models/statistics.js';

/**
 * @param {string} apiId 接口标识
 * @returns {import('express').RequestHandler} 统计中间件
 */
export const statisticsCollector = (apiId) => (req, res, next) => {
  res.on('finish', () => {
    const success = res.statusCode < 400;
    recordCall(apiId, success, req.ip).catch(() => {});
  });
  next();
};

export default statisticsCollector;
