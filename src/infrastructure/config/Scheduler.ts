import cron from 'node-cron';
import { RunScanner } from '../../application/use-cases/RunScanner';
import { IMessagingService } from '../../core/domain/interfaces/ExternalServices';
import { logger } from '../logging/WinstonLogger';

export class Scheduler {
    constructor(
        private runScanner: RunScanner,
        private messenger: IMessagingService
    ) { }

    setup() {
        // ─── Market Opening: 10:00 WIB ───────────────────────────────────────
        cron.schedule('0 10 * * 1-5', async () => {
            logger.info('🔔 [Morning-Scan] Triggered at 10:00 WIB');
            await this.performScheduledScan('MORNING (Awal Market)');
        }, { timezone: 'Asia/Jakarta' });

        // ─── Market Closing: 15:45 WIB ───────────────────────────────────────
        cron.schedule('45 15 * * 1-5', async () => {
            logger.info('🔔 [Afternoon-Scan] Triggered at 15:45 WIB');
            await this.performScheduledScan('AFTERNOON (Jelang Closing)');
        }, { timezone: 'Asia/Jakarta' });

        logger.info('✅ Scheduler ready. Dual daily scans active (10:00 & 15:45 WIB).');
    }

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
