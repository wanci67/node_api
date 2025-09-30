import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import './config/apm.js';
import applySecurityHeaders from './middlewares/securityHeaders.js';
import applyCsrfProtection from './middlewares/csrfProtection.js';
import requestLogger from './middlewares/requestLogger.js';
import requestSanitizer from './middlewares/requestSanitizer.js';
import ipFilter from './middlewares/ipFilter.js';
import dynamicRateLimiter from './middlewares/rateLimiter.js';
import authenticate from './middlewares/authentication.js';
import signatureValidator from './middlewares/signatureValidator.js';
import { loadApps } from './apps/loader.js';
import errorHandler from './middlewares/errorHandler.js';
import { success } from './utils/response.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @returns {Promise<import('express').Express>} 初始化后的应用实例
 */
export const createApp = async () => {
  const app = express();
  app.set('trust proxy', 1);
  applySecurityHeaders(app);
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser(process.env.CSRF_COOKIE_SECRET || 'change_me_csrf'));
  applyCsrfProtection(app);
  app.use(requestLogger());
  app.use(requestSanitizer());
  app.use(ipFilter());
  app.use(dynamicRateLimiter());
  const signatureMiddleware = signatureValidator();
  app.use((req, res, next) => {
    if (
      req.path.startsWith('/health') ||
      req.path.startsWith('/web') ||
      req.path.startsWith('/auth/login') ||
      req.path.startsWith('/readyz')
    ) {
      return next();
    }
    return signatureMiddleware(req, res, next);
  });
  app.use(authenticate());
  app.use('/web', express.static(path.join(__dirname, 'web'), { maxAge: '1h', etag: true }));

  await loadApps(app);

  app.get('/readyz', (req, res) => {
    success(res, { status: 'ready', timestamp: new Date().toISOString() });
  });

  app.use((req, res) => {
    res.status(404).json({ message: '资源未找到' });
  });

  app.use(errorHandler());
  return app;
};

export default createApp;
