import { Router } from 'express';

// 简单示例API：返回问候语
const router = Router();

router.get('/hello', (req, res) => {
  res.json({ message: '你好，世界！' });
});

export default router;
