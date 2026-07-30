import { createClient } from 'redis';
import logger from './logger.js';

let redisClient = null;
let redisAvailable = false;

const connectRedis = async () => {
  // Skip Redis if not configured
  if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
    logger.info('Redis not configured, skipping Redis connection');
    return null;
  }

  try {
    // Configure Redis client
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT) || 6379
      },
      password: process.env.REDIS_PASSWORD
    });

    redisClient.on('error', (err) => {
      redisAvailable = false;
      logger.error('Redis client error:', err);
    });

    redisClient.on('connect', () => {
      redisAvailable = true;
      logger.info('Redis client connected successfully');
    });

    redisClient.on('ready', () => {
      redisAvailable = true;
      logger.info('Redis client ready to use');
    });

    redisClient.on('end', () => {
      redisAvailable = false;
      logger.warn('Redis client disconnected');
    });

    await redisClient.connect();

    return redisClient;
  } catch (error) {
    logger.error('Redis connection error:', error);
    return null;
  }
};

const getRedisClient = () => {
  return redisClient;
};

const cacheGet = async (key) => {
  if (!redisClient || !redisAvailable) return null;

  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Cache get error:', error);
    return null;
  }
};

const cacheSet = async (key, value, expirySeconds = 3600) => {
  if (!redisClient || !redisAvailable) return false;

  try {
    await redisClient.setEx(key, expirySeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.error('Cache set error:', error);
    return false;
  }
};

const cacheDel = async (key) => {
  if (!redisClient || !redisAvailable) return false;

  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    logger.error('Cache delete error:', error);
    return false;
  }
};

const cacheFlush = async () => {
  if (!redisClient || !redisAvailable) return false;

  try {
    await redisClient.flushDb();
    return true;
  } catch (error) {
    logger.error('Cache flush error:', error);
    return false;
  }
};

export { connectRedis, getRedisClient, cacheGet, cacheSet, cacheDel, cacheFlush };