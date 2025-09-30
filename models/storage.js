import mysql from 'mysql2/promise';
import { createClient } from 'redis';
import LRU from 'lru-cache';
import { logger, createModuleLogger, recordDependencyState } from './logger.js';

const moduleLogger = createModuleLogger('storage');

/**
 * Redis默认配置，全部来自环境变量
 */
const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
  },
};

/**
 * MySQL连接池配置
 */
const mysqlPool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'secure_api',
  connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10),
  waitForConnections: true,
  enableKeepAlive: true,
  charset: 'utf8mb4',
});

/**
 * 内存缓存配置，主要用于热数据兜底
 */
const memoryCache = new LRU({
  max: 500,
  ttl: 60 * 1000,
});

let redisClient;
let redisReady = false;

/**
 * 初始化Redis客户端
 */
async function initRedis() {
  if (redisReady) {
    return redisClient;
  }
  redisClient = createClient(redisConfig);
  redisClient.on('error', (error) => {
    moduleLogger.error('Redis连接错误', { error: error.message });
    redisReady = false;
  });
  redisClient.on('ready', () => {
    moduleLogger.info('Redis连接成功');
    redisReady = true;
  });
  await redisClient.connect();
  return redisClient;
}

/**
 * 检查并初始化Redis
 */
async function getRedis() {
  if (!redisReady) {
    await initRedis();
  }
  return redisClient;
}

/**
 * 封装MySQL查询函数
 * @param {string} sql SQL语句
 * @param {any[]} params 参数
 * @returns {Promise<any>} 查询结果
 */
export async function query(sql, params = []) {
  moduleLogger.debug('执行SQL查询', { sql });
  const [rows] = await mysqlPool.query(sql, params);
  return rows;
}

/**
 * 事务执行器
 * @param {(conn: mysql.PoolConnection) => Promise<any>} handler 事务处理器
 * @returns {Promise<any>} 执行结果
 */
export async function transaction(handler) {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    moduleLogger.error('事务执行失败', { error: error.message });
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Redis缓存读取函数
 * @param {string} key 键
 * @returns {Promise<any>} 值
 */
export async function redisGet(key) {
  const client = await getRedis();
  const value = await client.get(key);
  if (value) {
    moduleLogger.debug('命中Redis缓存', { key });
    return JSON.parse(value);
  }
  moduleLogger.debug('Redis缓存未命中', { key });
  return null;
}

/**
 * Redis缓存写入函数
 * @param {string} key 键
 * @param {any} value 值
 * @param {number} ttl 过期时间
 */
export async function redisSet(key, value, ttl = 300) {
  const client = await getRedis();
  await client.set(key, JSON.stringify(value), { EX: ttl });
  moduleLogger.debug('写入Redis缓存', { key, ttl });
}

/**
 * 删除Redis键
 * @param {string} key 键
 */
export async function redisDel(key) {
  const client = await getRedis();
  await client.del(key);
  moduleLogger.debug('删除Redis缓存', { key });
}

/**
 * 内存缓存读取
 * @param {string} key 键
 */
export function memoryGet(key) {
  return memoryCache.get(key);
}

/**
 * 内存缓存写入
 * @param {string} key 键
 * @param {any} value 值
 * @param {number} ttl 存活时间
 */
export function memorySet(key, value, ttl = 60) {
  memoryCache.set(key, value, { ttl: ttl * 1000 });
}

/**
 * 内存缓存删除
 * @param {string} key 键
 */
export function memoryDel(key) {
  memoryCache.delete(key);
}

/**
 * 缓存通用封装，读取失败回源数据库
 * @param {string} key 缓存键
 * @param {() => Promise<any>} loader 数据加载器
 * @param {number} ttl 缓存时间
 */
export async function cacheWrap(key, loader, ttl = 300) {
  const memoryValue = memoryGet(key);
  if (memoryValue) {
    moduleLogger.debug('命中内存缓存', { key });
    return memoryValue;
  }
  const redisValue = await redisGet(key);
  if (redisValue) {
    memorySet(key, redisValue, ttl / 2);
    return redisValue;
  }
  const value = await loader();
  if (value !== undefined) {
    await redisSet(key, value, ttl);
    memorySet(key, value, ttl / 2);
  }
  return value;
}

/**
 * 防止SQL注入的辅助函数，使用参数绑定
 * @param {string} table 表名
 * @param {Record<string, any>} data 数据
 */
export async function insert(table, data) {
  const columns = Object.keys(data);
  const placeholders = columns.map(() => '?');
  const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders.join(',')})`;
  await query(sql, Object.values(data));
}

/**
 * 更新函数
 * @param {string} table 表名
 * @param {Record<string, any>} data 数据
 * @param {string} where 条件
 * @param {any[]} params 条件参数
 */
export async function update(table, data, where, params = []) {
  const columns = Object.keys(data);
  const assignments = columns.map((column) => `${column} = ?`).join(',');
  const sql = `UPDATE ${table} SET ${assignments} WHERE ${where}`;
  await query(sql, [...Object.values(data), ...params]);
}

/**
 * 删除函数
 * @param {string} table 表名
 * @param {string} where 条件
 * @param {any[]} params 条件参数
 */
export async function remove(table, where, params = []) {
  const sql = `DELETE FROM ${table} WHERE ${where}`;
  await query(sql, params);
}

/**
 * Redis批量写入
 * @param {Record<string, any>} entries 键值对
 * @param {number} ttl 过期时间
 */
export async function redisMSet(entries, ttl = 300) {
  const client = await getRedis();
  const pipeline = client.multi();
  Object.entries(entries).forEach(([key, value]) => {
    pipeline.set(key, JSON.stringify(value), { EX: ttl });
  });
  await pipeline.exec();
}

/**
 * Redis批量获取
 * @param {string[]} keys 键集合
 * @returns {Promise<any[]>} 结果
 */
export async function redisMGet(keys) {
  const client = await getRedis();
  const results = await client.mGet(keys);
  return results.map((value) => (value ? JSON.parse(value) : null));
}

/**
 * Redis分布式锁
 * @param {string} key 锁键
 * @param {number} ttl 锁有效期
 */
export async function acquireLock(key, ttl = 30) {
  const client = await getRedis();
  const result = await client.set(key, '1', { NX: true, EX: ttl });
  return result === 'OK';
}

/**
 * 释放分布式锁
 * @param {string} key 锁键
 */
export async function releaseLock(key) {
  const client = await getRedis();
  await client.del(key);
}

/**
 * 检查数据库连接
 */
export async function healthCheck() {
  const mysqlStatus = await mysqlPool.query('SELECT 1 AS alive');
  const redisStatus = redisReady;
  return {
    mysql: mysqlStatus[0].length > 0,
    redis: redisStatus,
  };
}

/**
 * 输出依赖状态，方便监控
 */
export async function reportDependencyStatus() {
  const status = await healthCheck();
  recordDependencyState(status);
  return status;
}

/**
 * MySQL查询封装，支持缓存
 * @param {string} sql SQL语句
 * @param {any[]} params 参数
 * @param {number} ttl 缓存时间
 */
export async function cachedQuery(sql, params = [], ttl = 60) {
  const cacheKey = `mysql:${sql}:${JSON.stringify(params)}`;
  return cacheWrap(cacheKey, async () => query(sql, params), ttl);
}

/**
 * 使用流式查询处理大数据量
 * @param {string} sql SQL语句
 * @param {any[]} params 参数
 * @param {(row: any) => Promise<void>} onRow 行处理函数
 */
export async function streamQuery(sql, params, onRow) {
  const connection = await mysqlPool.getConnection();
  try {
    const [rows] = await connection.query({ sql, rowsAsArray: false }, params);
    for (const row of rows) {
      await onRow(row);
    }
  } finally {
    connection.release();
  }
}

/**
 * 初始化模块
 */
export async function initializeStorage() {
  await initRedis();
  await reportDependencyStatus();
  moduleLogger.info('存储模块初始化完成');
}

/**
 * 清理资源
 */
export async function shutdownStorage() {
  try {
    await redisClient?.quit();
  } catch (error) {
    moduleLogger.warn('关闭Redis连接失败', { error: error.message });
  }
  try {
    await mysqlPool.end();
  } catch (error) {
    moduleLogger.warn('关闭MySQL连接失败', { error: error.message });
  }
  moduleLogger.info('存储模块已关闭');
}

/**
 * Redis计数器
 * @param {string} key 键
 * @param {number} ttl 过期时间
 */
export async function redisCounter(key, ttl = 60) {
  const client = await getRedis();
  const value = await client.incr(key);
  if (value === 1) {
    await client.expire(key, ttl);
  }
  return value;
}

/**
 * 将查询结果写入审计日志
 * @param {string} action 行为
 * @param {any} detail 详情
 */
export function auditQuery(action, detail) {
  logger.info('数据库审计', { action, detail });
}

/**
 * 重置缓存，用于管理后台
 */
export async function resetCache() {
  memoryCache.clear();
  if (redisReady) {
    await redisClient.flushAll();
  }
}

/**
 * Redis脚本执行封装
 * @param {string} script 脚本
 * @param {number} numKeys 键数量
 * @param {string[]} keys 键列表
 * @param {string[]} args 参数
 */
export async function redisEval(script, numKeys, keys, args) {
  const client = await getRedis();
  return client.eval(script, { keys, arguments: args, numKeys });
}

/**
 * MySQL连接获取器
 */
export function getMysqlPool() {
  return mysqlPool;
}

/**
 * Redis客户端获取器
 */
export function getRedisClient() {
  return redisClient;
}

/**
 * 缓存命名空间帮助函数
 * @param {string} namespace 命名空间
 * @param {string} key 键
 */
export function buildCacheKey(namespace, key) {
  return `${namespace}:${key}`;
}

/**
 * 缓存统计信息
 */
export function cacheStats() {
  return {
    memory: memoryCache.size,
    redis: redisReady,
  };
}

/**
 * 自动重连策略
 */
function setupMysqlMonitoring() {
  mysqlPool.on('connection', (connection) => {
    connection.on('error', (error) => {
      moduleLogger.error('MySQL连接错误', { error: error.message });
    });
    connection.on('end', () => {
      moduleLogger.warn('MySQL连接结束');
    });
  });
}

setupMysqlMonitoring();

/**
 * 将模块注册到全局，方便调试
 */
if (!global.__APP_STORAGE__) {
  global.__APP_STORAGE__ = {
    mysqlPool,
    redisConfig,
  };
}

