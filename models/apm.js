let apm = null;

if (process.env.APM_SERVER_URL && process.env.APM_SERVICE_NAME) {
  const apmModule = require('elastic-apm-node');
  apm = apmModule.start({
    serviceName: process.env.APM_SERVICE_NAME,
    serverUrl: process.env.APM_SERVER_URL,
    secretToken: process.env.APM_SECRET_TOKEN,
    environment: process.env.NODE_ENV || 'development',
  });
}

module.exports = apm;
