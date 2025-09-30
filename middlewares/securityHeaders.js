import helmet from 'helmet';
import hpp from 'hpp';

/**
 * @param {import('express').Express} app Express实例
 */
export const applySecurityHeaders = (app) => {
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }));
  app.use(hpp());
};

export default applySecurityHeaders;
