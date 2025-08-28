import { Router } from 'express';

// 返回服务器当前时间
const router = Router();

router.get('/time', (req, res) => {
  res.json({ time: new Date().toISOString() });
});

export default router;
