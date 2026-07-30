import logger from '../config/logger.js';
import { requestTimer } from './performance.js';

// Enhanced request logging middleware with performance tracking
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request start
  logger.info('Request started', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?._id,
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?._id,
    });

    originalEnd.apply(this, args);
  };

  next();
};

// Use the new performance monitoring middleware
export const performanceMonitor = requestTimer;

// Error tracking middleware
export const errorTracker = (err, req, res, next) => {
  logger.error('Request error', {
    error: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    method: req.method,
    url: req.originalUrl,
    userId: req.user?._id,
    params: req.params,
    query: req.query,
  });

  next(err);
};

export default {
  requestLogger,
  performanceMonitor,
  errorTracker,
};