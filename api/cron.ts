import { VercelRequest, VercelResponse } from '@vercel/node';
import { bootstrap } from '../src/bootstrap';
import { logger } from '../src/infrastructure/logging/WinstonLogger';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Basic security: Check for Vercel Cron Secret or just allow if env is correct
    // Vercel Crons automatically include a header 'x-vercel-cron'

    try {
        const startTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        const startTs = Date.now();

        const { runScanner, messaging, generateEveningSummary } = await bootstrap();

        const nowWib = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
        const hourWib = new Date(nowWib).getHours();

        if (hourWib >= 18 && hourWib <= 20) {
            // It's Evening! (Handling 18:00 - 20:59 as window for 19:00 cron)
            logger.info(`🌚 Triggering Evening Market Summary at ${startTime}`);
            const summary = await generateEveningSummary.execute();
            await messaging.broadcast(summary);

            return res.status(200).json({ success: true, type: 'EVENING_SUMMARY' });
        }

        logger.info(`⏰ Starting Scheduled Market Scan (Cron) at ${startTime}`);

        const report = await runScanner.execute();

        const endTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        const durationSec = Math.floor((Date.now() - startTs) / 1000);

        const message = `🏁 <b>Scheduled Scan Complete</b>\n` +
            `📊 Analyzed: ${report.totalScanned} stocks\n` +
            `📈 Signals: BUY(${report.buySignals.length}), SELL(${report.sellSignals.length})\n\n` +
            `🕒 Start: ${startTime}\n` +
            `🕒 End: ${endTime}\n` +
            `⏱️ Duration: ${durationSec}s`;

        await messaging.broadcast(message);

        return res.status(200).json({
            success: true,
            type: 'MARKET_SCAN',
            totalScanned: report.totalScanned,
            buySignals: report.buySignals.length
        });
    } catch (error: any) {
        logger.error('Cron Execution Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
