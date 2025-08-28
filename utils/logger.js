import fs from 'fs';
import path from 'path';

// 定义日志目录
const logDirs = {
  info: path.join('logs', 'info'),
  api: path.join('logs', 'api'),
  error: path.join('logs', 'error')
};

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 清理超过30天的日志文件
function cleanOldLogs(dir) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const now = Date.now();
  files.forEach(f => {
    const filePath = path.join(dir, f);
    const stat = fs.statSync(filePath);
    // 超过30天则删除
    if (now - stat.mtimeMs > 30 * 24 * 60 * 60 * 1000) {
      fs.unlinkSync(filePath);
    }
  });
}

// 获取当天日志文件路径
function getLogFile(dir) {
  ensureDir(dir);
  cleanOldLogs(dir);
  const date = new Date().toISOString().split('T')[0];
  return path.join(dir, `${date}.log`);
}

// 写入日志
function writeLog(dir, message) {
  const file = getLogFile(dir);
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(file, line);
}

export const logger = {
  info: msg => writeLog(logDirs.info, msg),
  api: msg => writeLog(logDirs.api, msg),
  error: msg => writeLog(logDirs.error, msg)
};
