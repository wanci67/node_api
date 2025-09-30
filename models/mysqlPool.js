import mysql from 'mysql2/promise';
import config from '../config/env.js';
import { logInfo, logError } from './logger.js';

/** @type {mysql.Pool | null} */
let pool = null;

/**
 * @returns {mysql.Pool} 获取或创建MySQL连接池
 */
export const getMysqlPool = () => {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number.parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: 20,
      queueLimit: 0,
      waitForConnections: true,
      enableKeepAlive: true,
    });
    logInfo('MySQL连接池已创建', { component: 'mysqlPool', env: config.nodeEnv });
  }
  return pool;
};

/**
 * @param {string} sql SQL语句
 * @param {Array<mysql.Value>} params 参数化数组
 * @returns {Promise<mysql.RowDataPacket[]>} 查询结果
 */
export const query = async (sql, params = []) => {
  try {
    const connection = await getMysqlPool().getConnection();
    try {
      const [rows] = await connection.query(sql, params);
      return rows;
    } finally {
      connection.release();
    }
  } catch (error) {
    logError(error, { component: 'mysqlPool', sql });
    throw error;
  }
};

export default {
  getMysqlPool,
  query,
};
