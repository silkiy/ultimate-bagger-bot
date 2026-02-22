import { VercelRequest, VercelResponse } from '@vercel/node';
import { bootstrap } from '../src/bootstrap';
import { logger } from '../src/infrastructure/logging/WinstonLogger';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Basic security: Check for Vercel Cron Secret or just allow if env is correct
    // Vercel Crons automatically include a header 'x-vercel-cron'

    try {
        const { runScanner, messaging } = await bootstrap();

        logger.info('⏰ Starting Scheduled Market Scan (Cron)...');

        const report = await runScanner.execute();

        const message = `🏁 <b>Scheduled Scan Complete</b>\n` +
            `📊 Analyzed: ${report.totalScanned} stocks\n` +
            `📈 Signals: BUY(${report.buySignals.length}), SELL(${report.sellSignals.length})`;

        await messaging.broadcast(message);

        return res.status(200).json({
            success: true,
            totalScanned: report.totalScanned,
            buySignals: report.buySignals.length
        });
    } catch (error: any) {
        logger.error('Cron Execution Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
