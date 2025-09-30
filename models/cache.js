const LRU = require('lru-cache');

/**
 * @type {LRU<string, any>}
 */
const cacheStore = new LRU({
  max: Number(process.env.CACHE_MAX_ENTRIES || 200),
  ttl: Number(process.env.CACHE_TTL_MS || 1000 * 60 * 5),
});

/**
 * @param {string} key 缓存键
 * @param {any} value 缓存值
 * @param {number} [ttl] 自定义有效期
 * @returns {void}
 */
const setCache = (key, value, ttl) => {
  if (ttl) {
    cacheStore.set(key, value, { ttl });
    return;
  }
  cacheStore.set(key, value);
};

/**
 * @param {string} key 缓存键
 * @returns {any}
 */
const getCache = (key) => cacheStore.get(key);

module.exports = {
  cacheStore,
  setCache,
  getCache,
};
