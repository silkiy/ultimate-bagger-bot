import { VercelRequest, VercelResponse } from '@vercel/node';
import { bootstrap } from '../src/bootstrap';
import { logger } from '../src/infrastructure/logging/WinstonLogger';
import mongoose from 'mongoose';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const { marketData, userRepo, messaging } = await bootstrap();

        const bot = messaging.getBotInstance();
        const webhookInfo = await bot.telegram.getWebhookInfo();

        const health = {
            status: 'OK',
            timestamp: new Date().toISOString(),
            database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
            telegram: {
                webhook: webhookInfo.url,
                pendingUpdates: webhookInfo.pending_update_count,
                lastError: webhookInfo.last_error_message
            },
            environment: process.env.NODE_ENV,
            features: {
                marketDiscovery: !!marketData.fetchTopActiveSymbols,
                userManagement: !!userRepo.findAll
            }
        };

        return res.status(200).json(health);
    } catch (error: any) {
        logger.error('Health Check Failed:', error);
        return res.status(500).json({
            status: 'ERROR',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
