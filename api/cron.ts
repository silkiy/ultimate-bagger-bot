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
        const now = new Date(nowWib);
        const hourWib = now.getHours();
        const minuteWib = now.getMinutes();

        // Helper for running personal scans
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

        // ─── Morning Session (08:50 - 09:30 Window) ──────────────────────────────
        if (hourWib === 8 || (hourWib === 9 && minuteWib <= 30)) {
            logger.info(`⏰ Starting Morning Market Scan at ${startTime}`);
            const report = await runScanner.execute();
            const msg = `🌅 <b>Morning Market Open Scan</b>\n` +
                        `📊 Analyzed: ${report.totalScanned} stocks\n` +
                        `📈 Signals: BUY(${report.buySignals.length}), SELL(${report.sellSignals.length})`;
            await messaging.broadcast(msg);
            return res.status(200).json({ success: true, type: 'MORNING_SCAN' });
        }

        // ─── Midday Session (11:50 - 12:45 Window) ──────────────────────────────
        if (hourWib === 11 || (hourWib === 12 && minuteWib <= 45)) {
            logger.info(`🕐 Triggering Midday Personal Watchlist at ${startTime}`);
            const sent = await runPersonalScan('MIDDAY');
            return res.status(200).json({ success: true, type: 'MIDDAY_WATCHLIST', personalSent: sent });
        }

        // ─── Closing Session (15:50 - 16:45 Window) ──────────────────────────────
        if (hourWib === 15 || (hourWib === 16 && minuteWib <= 45)) {
            logger.info(`🕓 Triggering Closing Scan + Personal Watchlist at ${startTime}`);
            const report = await runScanner.execute();
            const sent = await runPersonalScan('CLOSING');
            const msg = `🏁 <b>Closing Market Scan</b>\n` +
                        `📊 Analyzed: ${report.totalScanned} stocks\n` +
                        `📈 Signals: BUY(${report.buySignals.length}), SELL(${report.sellSignals.length})`;
            await messaging.broadcast(msg);
            return res.status(200).json({ success: true, type: 'CLOSING_SCAN', totalScanned: report.totalScanned });
        }

        // ─── Evening Session (18:50 - 21:00 Window) ──────────────────────────────
        if (hourWib >= 18 && hourWib <= 21) {
            logger.info(`🌚 Triggering Evening Summary + Personal Watchlist at ${startTime}`);
            const summary = await generateEveningSummary.execute();
            await messaging.broadcast(summary);
            const sent = await runPersonalScan('EVENING');
            return res.status(200).json({ success: true, type: 'EVENING_SUMMARY', personalSent: sent });
        }

        return res.status(200).json({ 
            success: true, 
            message: 'Cron hit but no specific session window matched.',
            time: startTime,
            hour: hourWib
        });

    } catch (error: any) {
        logger.error('Cron Execution Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
