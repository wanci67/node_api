const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const dotenv = require('dotenv');
const path = require('path');
const asyncHandler = require('../middleware/asyncHandler');
const authMiddleware = require('../middleware/auth');
const errorHandler = require('../middleware/errorHandler');
const { globalLimiter, screenshotLimiter } = require('../models/rateLimiter');
const { screenshotSchema } = require('../models/validation');
const { sanitizeUrl } = require('../models/security');
const { captureScreenshot } = require('../models/renderer');
const { logPerformance, logger } = require('../models/logger');
const { recordAuditEvent, getAuditStats } = require('../models/audit');

dotenv.config();

const app = express();
const staticDir = path.resolve(process.env.SCREENSHOT_DIR || 'storage/screenshots');

// 使用 Helmet 增强响应头安全性，抵御常见攻击
app.use(helmet());
// 启用 Gzip 压缩，减小传输体积
app.use(compression());
// 限制 JSON 请求体大小，防止大包攻击
app.use(express.json({ limit: '512kb' }));
// 全局限流器防止接口被暴力滥用
app.use(globalLimiter);
// 校验接口访问授权信息
app.use(authMiddleware);
// 暴露静态截图目录，供直链访问
app.use('/public/screenshots', express.static(staticDir, { maxAge: '1d' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    audit: getAuditStats(),
  });
});

app.post(
  '/render/screenshot',
  screenshotLimiter,
  asyncHandler(async (req, res) => {
    // 使用 Joi 校验请求体，确保数据符合预期格式
    const validation = screenshotSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (validation.error) {
      recordAuditEvent({
        action: 'screenshot',
        status: 'failure',
        reason: 'validation-error',
        details: validation.error.details,
        ip: req.ip,
      });
      res.status(400).json({
        success: false,
        message: '请求参数校验失败',
        details: validation.error.details.map((detail) => detail.message),
      });
      return;
    }

    // 通过校验后的参数集合
    const payload = validation.value;
    let safeUrl;
    try {
      safeUrl = sanitizeUrl(payload.url);
    } catch (error) {
      recordAuditEvent({
        action: 'screenshot',
        status: 'failure',
        reason: 'invalid-url',
        ip: req.ip,
      });
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    const startTime = Date.now();
    try {
      // 调用渲染模块执行截图逻辑
      const result = await captureScreenshot({
        ...payload,
        url: safeUrl,
      });
      const duration = Date.now() - startTime;
      logPerformance(req, duration, { url: safeUrl, format: payload.format });
      recordAuditEvent({
        action: 'screenshot',
        status: 'success',
        ip: req.ip,
        duration,
      });
      res.json({
        success: true,
        result,
      });
    } catch (error) {
      logger.error('截图接口执行异常', {
        message: error.message,
        stack: error.stack,
        url: safeUrl,
      });
      throw error;
    }
  }),
);

app.use(errorHandler);

module.exports = app;
