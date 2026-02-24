import cron from 'node-cron';
import { RunScanner } from '../../application/use-cases/RunScanner';
import { GenerateEveningSummary } from '../../application/use-cases/GenerateEveningSummary';
import { ScanPersonalWatchlist, ScanSession } from '../../application/use-cases/ScanPersonalWatchlist';
import { WatchlistSentinel } from '../../application/use-cases/WatchlistSentinel';
import { IMessagingService } from '../../core/domain/interfaces/ExternalServices';
import { IUserRepository } from '../../core/domain/interfaces/UserRepository';
import { logger } from '../logging/WinstonLogger';

export class Scheduler {
    constructor(
        private runScanner: RunScanner,
        private messenger: IMessagingService,
        private eveningSummary: GenerateEveningSummary,
        private personalWatchlist: ScanPersonalWatchlist,
        private sentinel: WatchlistSentinel,
        private userRepo: IUserRepository
    ) { }

    setup() {
        // ─── Watchlist Sentinel: Every 30 mins during market hours (09:00 - 16:00) ──
        cron.schedule('*/30 9-16 * * 1-5', async () => {
            logger.info('🚨 [Sentinel-Trigger] Running anomaly detection...');
            await this.sentinel.execute();
        }, { timezone: 'Asia/Jakarta' });

        // ─── Market Opening: 10:00 WIB ───────────────────────────────────────
        cron.schedule('0 10 * * 1-5', async () => {
            logger.info('🔔 [Morning-Scan] Triggered at 10:00 WIB');
            await this.performScheduledScan('MORNING (Awal Market)');
        }, { timezone: 'Asia/Jakarta' });

        // ─── Sesi 1 Tutup: 12:00 WIB (Personalized Watchlist) ────────────────
        cron.schedule('0 12 * * 1-5', async () => {
            logger.info('🔔 [Midday-Watchlist] Triggered at 12:00 WIB');
            await this.performPersonalizedScan('MIDDAY');
        }, { timezone: 'Asia/Jakarta' });

        // ─── Market Closing: 15:45 WIB ───────────────────────────────────────
        cron.schedule('45 15 * * 1-5', async () => {
            logger.info('🔔 [Afternoon-Scan] Triggered at 15:45 WIB');
            await this.performScheduledScan('AFTERNOON (Jelang Closing)');
        }, { timezone: 'Asia/Jakarta' });

        // ─── Sesi 2 Tutup: 16:00 WIB (Personalized Watchlist) ────────────────
        cron.schedule('0 16 * * 1-5', async () => {
            logger.info('🔔 [Closing-Watchlist] Triggered at 16:00 WIB');
            await this.performPersonalizedScan('CLOSING');
        }, { timezone: 'Asia/Jakarta' });

        // ─── Evening Summary: 19:00 WIB ──────────────────────────────────────
        cron.schedule('0 19 * * 1-5', async () => {
            logger.info('🔔 [Evening-Summary] Triggered at 19:00 WIB');
            await this.performEveningSummary();
            // Also send personalized evening watchlist scan
            await this.performPersonalizedScan('EVENING');
        }, { timezone: 'Asia/Jakarta' });

        logger.info('✅ Scheduler ready. Global scans (10:00 & 15:45) + Personal Watchlist (12:00, 16:00, 19:00) active.');
    }

    // ─── Personalized Watchlist Scan (per-user isolation) ─────────────────────
    private async performPersonalizedScan(session: ScanSession) {
        try {
            const users = await this.userRepo.findAll();
            const approvedUsers = users.filter(u => u.status === 'APPROVED');

            if (approvedUsers.length === 0) {
                logger.info(`[Personal Scan] No approved users, skipping.`);
                return;
            }

            logger.info(`📋 [Personal Scan ${session}] Scanning watchlists for ${approvedUsers.length} users...`);

            for (const user of approvedUsers) {
                try {
                    const report = await this.personalWatchlist.execute(user.telegramId, session);
                    if (report) {
                        await this.messenger.sendToUser(user.telegramId, report);
                        logger.info(`✅ Sent ${session} watchlist to ${user.username || user.telegramId}`);
                    } else {
                        logger.info(`⏭️ ${user.username || user.telegramId}: No watchlist, skipped.`);
                    }
                } catch (err: any) {
                    logger.error(`[Personal Scan] Failed for ${user.telegramId}: ${err.message}`);
                }
            }

            logger.info(`✅ [Personal Scan ${session}] Complete.`);
        } catch (err: any) {
            logger.error(`[Personal Scan] ${session} Failed:`, err.message);
        }
    }

    // ─── Evening Summary (Global Broadcast) ──────────────────────────────────
    private async performEveningSummary() {
        try {
            const summary = await this.eveningSummary.execute();
            await this.messenger.broadcast(summary);
            logger.info('✅ Evening summary broadcasted successfully.');
        } catch (err: any) {
            logger.error('[Evening Summary] Failed:', err.message);
        }
    }

    // ─── Global Market Scan (Broadcast to ALL) ───────────────────────────────
    private async performScheduledScan(periodName: string) {
        const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        try {
            // 1. Initial Broadcast
            await this.messenger.broadcast(
                `📡 <b>Auto-Scan ${periodName} Dimulai</b>\n` +
                `🕒 ${now}\n` +
                `⏳ Menganalisis Top Active IDX (Dynamic) & Saham Watchlist...`
            );

            // 2. Execute Scan
            const report = await this.runScanner.execute();
            const regimeEmoji = report.regime === 'BULL' ? '🟢' : report.regime === 'BEAR' ? '🔴' : '🟡';
            const actionableBuy = report.buySignals.length;
            const actionableSell = report.sellSignals.length;

            // 3. Status Summary Broadcast
            let summary = `📊 <b>Status Pasar IDX (${periodName})</b>\n`;
            summary += `${regimeEmoji} Regime IHSG: <b>${report.regime}</b> | 🕒 ${now}\n`;
            summary += `📋 Dianalisis: <b>${report.totalScanned} saham</b> terpilih\n\n`;

            if (actionableBuy > 0 || actionableSell > 0) {
                summary += `🎯 <b>Sinyal Trading Valid:</b>\n`;
                if (actionableBuy > 0) summary += `  ✅ BUY: <b>${actionableBuy} saham</b>\n`;
                if (actionableSell > 0) summary += `  🔴 SELL: <b>${actionableSell} saham</b>\n`;
            } else {
                summary += `⏸️ <i>Belum ada sinyal valid (Strategi sedang menunggu konfirmasi harga).</i>\n`;
            }

            await this.messenger.broadcast(summary);

            // 4. Ranking Table Broadcast (Top 10 only for broadcast to avoid spam)
            if (report.rankedItems.length > 0) {
                const top10 = report.rankedItems.slice(0, 10);
                let rankMsg = `🏆 <b>Top Assets Saat Ini</b>\n<code>No  Saham      Sinyal  Score</code>\n`;
                top10.forEach((item, idx) => {
                    const no = String(idx + 1).padStart(2, ' ');
                    const sym = item.symbol.replace('.JK', '').padEnd(10, ' ');
                    const sigLabel = item.signal === 'BUY' ? 'BUY ' : item.signal === 'SELL' ? 'SELL' : 'HOLD';
                    const score = item.score.toFixed(2).padStart(6, ' ');
                    rankMsg += `<code>${no}. ${sym} ${sigLabel} ${score}</code>\n`;
                });
                rankMsg += `\n<i>👉 Gunakan /scan untuk daftar lengkap Top 20.</i>`;
                await this.messenger.broadcast(rankMsg);
            }

            // 5. High Conviction Alerts (Interactive for each signal)
            for (const signal of report.buySignals) {
                const msg = `🚀 <b>SINYAL BELI VALID</b>\nStock: ${signal.symbol}\nPrice: ${signal.price}\nConfidence: ${signal.confidence?.toFixed(0)}%\n\n<i>Cek /analyze ${signal.symbol} untuk detail.</i>`;
                await this.messenger.broadcast(msg);
            }

        } catch (err: any) {
            logger.error(`[Scheduled Scan] ${periodName} Failed:`, err.message);
            await this.messenger.broadcast(`❌ <b>Auto-Scan Error (${periodName}):</b> ${err.message}`);
        }
    }
}
