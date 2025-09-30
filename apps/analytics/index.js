import { Router } from 'express';
import { success } from '../../utils/response.js';
import { getRedisClient } from '../../models/redisClient.js';

const router = Router();

router.get('/', async (req, res) => {
  const redis = getRedisClient();
  const pattern = 'statistics:api:*';
  const stats = [];
  if (redis.status === 'ready') {
    const stream = redis.scanStream({ match: pattern, count: 100 });
    for await (const keys of stream) {
      // eslint-disable-next-line no-continue
      for (const key of keys) {
        if (key.endsWith(':ips')) {
          // eslint-disable-next-line no-continue
          continue;
        }
        const data = await redis.hgetall(key);
        const ipCount = await redis.scard(`${key}:ips`);
        stats.push({ key, ...data, ipCount });
      }
    }
  }
  success(res, stats);
});

export default {
  id: 'analytics',
  name: '接口统计',
  desc: '统计接口调用量、成功率、失败率等指标。',
  status: 'normal',
  link: './Interfaces.html#analytics',
  basePath: '/analytics',
  router,
};
