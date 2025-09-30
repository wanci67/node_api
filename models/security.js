const xss = require('xss');
const validator = require('validator');

/**
 * @param {string} url 用户输入的 URL
 * @returns {string} 清洗后的安全 URL
 */
const sanitizeUrl = (url) => {
  const trimmed = url.trim();
  if (!validator.isURL(trimmed, { protocols: ['http', 'https'], require_protocol: true })) {
    throw new Error('非法的 URL 地址');
  }
  return xss(trimmed, {
    whiteList: [],
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script'],
  });
};

module.exports = {
  sanitizeUrl,
};
