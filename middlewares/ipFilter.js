import { addMaliciousAgent, autoBlacklist, isBlacklisted, isMaliciousAgent, isWhiteListed } from '../models/ipAccessControl.js';

/**
 * @returns {import('express').RequestHandler} IP过滤中间件
 */
export const ipFilter = () => async (req, res, next) => {
  const ip = req.ip;
  const userAgent = req.headers['user-agent'] || '';
  if (await isWhiteListed(ip)) {
    return next();
  }
  if (await isBlacklisted(ip)) {
    return res.status(403).json({ message: '访问被拒绝' });
  }
  if (await isMaliciousAgent(userAgent)) {
    await addMaliciousAgent(userAgent);
    await autoBlacklist(ip, { reason: 'malicious_ua', userAgent });
    return res.status(403).json({ message: '检测到恶意访问' });
  }
  return next();
};

export default ipFilter;
