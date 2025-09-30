import apm from 'elastic-apm-node';
import config from './env.js';

if (process.env.APM_SERVER_URL) {
  apm.start({
    serviceName: process.env.APM_SERVICE_NAME || 'secure-node-api',
    serverUrl: process.env.APM_SERVER_URL,
    secretToken: process.env.APM_SECRET_TOKEN || undefined,
    environment: config.nodeEnv,
    captureBody: 'all',
    captureHeaders: true,
  });
}

export default apm;
