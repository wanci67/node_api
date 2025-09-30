import { RateLimiterMemory } from 'rate-limiter-flexible';
import config from '../config/env.js';
import { collectSystemMetrics } from './systemMonitor.js';

let currentPoints = config.rateLimitBase;

const limiter = new RateLimiterMemory({
  points: currentPoints,
  duration: 1,
  blockDuration: 5,
});

/**
 * @returns {number} 基于系统指标的动态限流点数
 */
const calculateDynamicPoints = () => {
  const metrics = collectSystemMetrics();
  const stress = Math.max(metrics.cpu, metrics.memory, metrics.loadAvg);
  const dynamicPoints = Math.round(
    config.rateLimitBase + (1 - Math.min(stress, 0.95)) * (config.rateLimitMax - config.rateLimitBase),
  );
  currentPoints = Math.max(config.rateLimitBase, Math.min(dynamicPoints, config.rateLimitMax));
  limiter.points = currentPoints;
  return currentPoints;
};

/**
 * @param {string} key 限流键
 * @returns {Promise<void>} 申请一次令牌
 */
export const consume = async (key) => {
  calculateDynamicPoints();
  await limiter.consume(key);
};

/**
 * @returns {number} 当前限流点数
 */
export const getCurrentPoints = () => currentPoints;

export default {
  consume,
  getCurrentPoints,
};
