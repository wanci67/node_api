const { logger } = require('./logger');

let totalRequests = 0;
let totalFailures = 0;

/**
 * @param {object} payload 审计信息
 * @returns {void}
 */
const recordAuditEvent = (payload) => {
  totalRequests += 1;
  if (payload.status === 'failure') {
    totalFailures += 1;
  }
  logger.info('审计日志记录', {
    ...payload,
    totalRequests,
    totalFailures,
  });
};

/**
 * @returns {{ totalRequests: number, totalFailures: number }} 当前统计数据
 */
const getAuditStats = () => ({
  totalRequests,
  totalFailures,
});

module.exports = {
  recordAuditEvent,
  getAuditStats,
};
