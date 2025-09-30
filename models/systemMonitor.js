import os from 'os';

/**
 * @typedef {Object} SystemMetrics
 * @property {number} cpu 使用率(0-1)
 * @property {number} memory 内存占用率(0-1)
 * @property {number} loadAvg 负载
 */

/**
 * @returns {SystemMetrics} 当前系统指标
 */
export const collectSystemMetrics = () => {
  const cpus = os.cpus();
  const cpuLoad = cpus.reduce((acc, cpu) => {
    const total = Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
    return acc + (1 - cpu.times.idle / total);
  }, 0);

  const memoryUsage = 1 - os.freemem() / os.totalmem();
  const loadAvg = os.loadavg()[0] / cpus.length;

  return {
    cpu: Number.parseFloat((cpuLoad / cpus.length).toFixed(2)),
    memory: Number.parseFloat(memoryUsage.toFixed(2)),
    loadAvg: Number.parseFloat(loadAvg.toFixed(2)),
  };
};

export default {
  collectSystemMetrics,
};
