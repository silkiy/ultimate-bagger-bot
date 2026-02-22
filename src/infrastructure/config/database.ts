import mongoose from 'mongoose';
import { ENV } from './env';
import { logger } from '../logging/WinstonLogger';

export const connectDatabase = async () => {
    try {
        await mongoose.connect(ENV.MONGODB_URI);
        logger.info('✅ MongoDB connected successfully');
    } catch (error) {
        logger.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};

mongoose.connection.on('disconnected', () => {
    logger.warn('⚠️ MongoDB disconnected');
});
