import { VercelRequest, VercelResponse } from '@vercel/node';
import { bootstrap } from '../src/bootstrap';
import { logger } from '../src/infrastructure/logging/WinstonLogger';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const startTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        const startTs = Date.now();

        const {
            runScanner, messaging, generateEveningSummary,
            scanPersonalWatchlist, userRepo, watchlistSentinel
        } = await bootstrap();

        // Always run Sentinel on every cron hit
        await watchlistSentinel.execute();

        const nowWib = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
        const hourWib = new Date(nowWib).getHours();

        // ─── Personalized Watchlist Scan (12:00, 16:00, 19:00) ────────────
        const runPersonalScan = async (session: 'MIDDAY' | 'CLOSING' | 'EVENING') => {
            const users = await userRepo.findAll();
            const approved = users.filter(u => u.status === 'APPROVED');
            let sent = 0;
            for (const user of approved) {
                const report = await scanPersonalWatchlist.execute(user.telegramId, session);
                if (report) {
                    await messaging.sendToUser(user.telegramId, report);
                    sent++;
                }
            }
            return sent;
        };

        // ─── Evening: 18-20 Window ────────────────────────────────────────
        if (hourWib >= 18 && hourWib <= 20) {
            logger.info(`🌚 Triggering Evening Summary + Personal Watchlist at ${startTime}`);
            const summary = await generateEveningSummary.execute();
            await messaging.broadcast(summary);
            const sent = await runPersonalScan('EVENING');
            return res.status(200).json({ success: true, type: 'EVENING_SUMMARY', personalSent: sent });
        }

        // ─── Midday: 11-12 Window ─────────────────────────────────────────
        if (hourWib >= 11 && hourWib <= 12) {
            logger.info(`🕐 Triggering Midday Personal Watchlist at ${startTime}`);
            const sent = await runPersonalScan('MIDDAY');
            return res.status(200).json({ success: true, type: 'MIDDAY_WATCHLIST', personalSent: sent });
        }

        // ─── Closing: 15-16 Window ────────────────────────────────────────
        if (hourWib >= 15 && hourWib <= 16) {
            logger.info(`🕓 Triggering Closing Scan + Personal Watchlist at ${startTime}`);

            // Global market scan
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

            // Personal watchlist
            const sent = await runPersonalScan('CLOSING');

            return res.status(200).json({
                success: true,
                type: 'CLOSING_SCAN',
                totalScanned: report.totalScanned,
                buySignals: report.buySignals.length,
                personalSent: sent
            });
        }

        // ─── Morning: Default fallback ────────────────────────────────────
        logger.info(`⏰ Starting Morning Market Scan at ${startTime}`);
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
            type: 'MORNING_SCAN',
            totalScanned: report.totalScanned,
            buySignals: report.buySignals.length
        });
    } catch (error: any) {
        logger.error('Cron Execution Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
