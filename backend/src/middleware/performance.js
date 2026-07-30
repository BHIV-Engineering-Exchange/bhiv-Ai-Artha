import logger from '../config/logger.js';
import performanceService from '../services/performance.service.js';

/**
 * Request timing middleware
 */
export const requestTimer = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
    };

    performanceService.recordRequest(duration, res.statusCode);

    if (duration > 1000) {
      logger.warn('Slow request detected', logData);
    } else if (process.env.NODE_ENV !== 'production') {
      logger.info('Request completed', logData);
    }
  });

  next();
};

let memoryMonitorInterval = null;

/**
 * Memory usage monitor — returns interval ID for cleanup
 */
export const memoryMonitor = () => {
  if (memoryMonitorInterval) return memoryMonitorInterval;

  memoryMonitorInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    const memoryData = {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
    };

    performanceService.recordMemoryUsage(memUsage);

    if (process.env.NODE_ENV !== 'production') {
      logger.info('Memory usage', memoryData);
    }

    if (memUsage.heapUsed > 500 * 1024 * 1024) {
      logger.warn('High memory usage detected', memoryData);
    }
  }, 60000);

  return memoryMonitorInterval;
};

export const stopMemoryMonitor = () => {
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
    memoryMonitorInterval = null;
  }
};
