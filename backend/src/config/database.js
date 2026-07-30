import mongoose from 'mongoose';
import logger from './logger.js';

// Global flag to track transaction availability
let transactionsAvailable = false;

const connectDB = async () => {
  try {
    const mongoURI = process.env.NODE_ENV === 'test' 
      ? process.env.MONGODB_TEST_URI 
      : process.env.MONGODB_URI;

    const options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    await mongoose.connect(mongoURI, options);
    
    logger.info(`MongoDB Connected: ${mongoose.connection.host}`);

    mongoose.connection.on('disconnected', () => {
      transactionsAvailable = false;
      logger.warn('MongoDB disconnected - transactions disabled');
    });

    mongoose.connection.on('connected', async () => {
      try {
        await mongoose.connection.db.admin().command({ replSetGetStatus: 1 });
        transactionsAvailable = true;
        logger.info('MongoDB reconnected - transactions enabled');
      } catch {
        transactionsAvailable = false;
        logger.warn('MongoDB reconnected - transactions disabled (no replica set)');
      }
    });
    
    // Check for replica set and transaction support
    try {
      await mongoose.connection.db.admin().command({ replSetGetStatus: 1 });
      transactionsAvailable = true;
      logger.info('✅ Replica set detected - transactions enabled');
    } catch (error) {
      transactionsAvailable = false;
      logger.warn('⚠️  Not running as replica set - transactions disabled');
      
      if (process.env.NODE_ENV === 'production') {
        logger.error('❌ Production environment requires MongoDB replica set for transactions');
        logger.error('Please configure MongoDB as a replica set or use MongoDB Atlas');
        // Don't exit in production, but log critical warning
      }
    }
  } catch (error) {
    logger.error(`Database connection error: ${error.message}`);
    process.exit(1);
  }
};

// Helper function to check transaction availability
export const areTransactionsAvailable = () => transactionsAvailable;

// Safe transaction wrapper
export const withTransaction = async (callback) => {
  if (!transactionsAvailable) {
    logger.warn('Transactions not available - executing without transaction');
    return await callback(null);
  }
  
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

export default connectDB;