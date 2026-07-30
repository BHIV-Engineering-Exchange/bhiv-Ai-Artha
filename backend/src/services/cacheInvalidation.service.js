import { getRedisClient } from '../config/redis.js';
import logger from '../config/logger.js';

class CacheInvalidationService {
  async invalidateByPattern(pattern) {
    try {
      const redisClient = getRedisClient();
      if (!redisClient) {
        logger.debug('Redis not available, skipping cache invalidation');
        return false;
      }

      logger.info(`Cache invalidation requested for pattern: ${pattern}`);

      switch (pattern) {
        case 'ledger:*':
          await this.invalidateLedgerCache();
          break;
        case 'invoices:*':
          await this.invalidateInvoiceCache();
          break;
        case 'expenses:*':
          await this.invalidateExpenseCache();
          break;
        case 'accounts:*':
          await this.invalidateAccountsCache();
          break;
        default:
          await this.deleteByWildcard(pattern);
      }

      return true;
    } catch (error) {
      logger.error('Cache invalidation error:', error);
      return false;
    }
  }

  async invalidateLedgerCache() {
    const patterns = [
      'artha:ledger:*',
      'artha:accounts:*',
    ];
    await this.deleteKeys(patterns);
    logger.info('Ledger cache invalidated');
  }

  async invalidateInvoiceCache() {
    const patterns = [
      'artha:invoices:*',
    ];
    await this.deleteKeys(patterns);
    logger.info('Invoice cache invalidated');
  }

  async invalidateExpenseCache() {
    const patterns = [
      'artha:expenses:*',
    ];
    await this.deleteKeys(patterns);
    logger.info('Expense cache invalidated');
  }

  async invalidateAccountsCache() {
    const patterns = [
      'artha:accounts:*',
    ];
    await this.deleteKeys(patterns);
    logger.info('Accounts cache invalidated');
  }

  async deleteByWildcard(pattern) {
    const redisPattern = pattern.replace(/\*/g, '*');
    await this.deleteKeys([redisPattern]);
  }

  async deleteKeys(patterns) {
    try {
      const redisClient = getRedisClient();
      if (!redisClient) return;

      for (const pattern of patterns) {
        try {
          let cursor = 0;
          do {
            const result = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
            cursor = result.cursor;
            if (result.keys.length > 0) {
              await redisClient.del(result.keys);
              logger.debug(`Deleted ${result.keys.length} cache keys matching ${pattern}`);
            }
          } while (cursor !== 0);
        } catch (error) {
          logger.debug(`Failed to scan/delete cache keys for pattern ${pattern}:`, error.message);
        }
      }
    } catch (error) {
      logger.error('Error deleting cache keys:', error);
    }
  }

  async clearAllCache() {
    try {
      const redisClient = getRedisClient();
      if (!redisClient) return false;

      await redisClient.flushDb();
      logger.info('All cache cleared');
      return true;
    } catch (error) {
      logger.error('Error clearing all cache:', error);
      return false;
    }
  }
}

export default new CacheInvalidationService();
