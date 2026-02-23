import mongoose from 'mongoose';
import { ENV } from './env';
import { logger } from '../logging/WinstonLogger';

export const connectDatabase = async () => {
    if (mongoose.connection.readyState >= 1) {
        return;
    }

    try {
        await mongoose.connect(ENV.MONGODB_URI);
        logger.info('✅ MongoDB connected successfully');
    } catch (error: any) {
        logger.error('❌ MongoDB connection error:', error);
        throw new Error(`Database connection failed: ${error.message}`);
    }
};

mongoose.connection.on('disconnected', () => {
    logger.warn('⚠️ MongoDB disconnected');
});
