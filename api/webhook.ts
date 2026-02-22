import { VercelRequest, VercelResponse } from '@vercel/node';
import { bootstrap } from '../src/bootstrap';
import { logger } from '../src/infrastructure/logging/WinstonLogger';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const { messaging } = await bootstrap();
        const bot = messaging.getBotInstance();

        // Handle the update from Telegram
        await bot.handleUpdate(req.body);

        return res.status(200).send('OK');
    } catch (error: any) {
        logger.error('Webhook Error:', error);
        return res.status(500).send(`Internal Server Error: ${error.message}`);
    }
}
