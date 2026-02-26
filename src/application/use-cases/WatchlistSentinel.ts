import { IUserRepository } from '../../core/domain/interfaces/UserRepository';
import { ITickerRepository } from '../../core/domain/interfaces/TickerRepository';
import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { IMessagingService } from '../../core/domain/interfaces/ExternalServices';
import { DomainMath } from '../../core/domain/logic/Math';
import { logger } from '../../infrastructure/logging/WinstonLogger';

export class WatchlistSentinel {
    constructor(
        private userRepo: IUserRepository,
        private tickerRepo: ITickerRepository,
        private marketData: IMarketDataProvider,
        private messenger: IMessagingService
    ) { }

    async execute(): Promise<void> {
        try {
            const users = await this.userRepo.findAll();
            const approvedUsers = users.filter(u => u.status === 'APPROVED');

            if (approvedUsers.length === 0) return;

            logger.info(`🚨 [Sentinel] Checking anomalies for ${approvedUsers.length} users...`);

            // Parallelize across users
            await Promise.all(approvedUsers.map(async (user) => {
                const watchlist = await this.tickerRepo.findAll(user.telegramId);
                if (watchlist.length === 0) return;

                // Parallelize across tickers for each user
                await Promise.all(watchlist.map(ticker =>
                    this.checkAnomaly(user.telegramId, ticker.config.symbol)
                ));
            }));
        } catch (error: any) {
            logger.error(`[Sentinel] Execution failed: ${error.message}`);
        }
    }

    private async checkAnomaly(telegramId: string, symbol: string): Promise<void> {
        try {
            // 1. Fetch data
            const [history, quote] = await Promise.all([
                this.marketData.fetchHistoricalData(symbol, new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)), // ~30 bars
                this.marketData.fetchRealTimeQuote ? this.marketData.fetchRealTimeQuote(symbol) : null
            ]);

            if (!history || history.length < 22 || !quote) return;

            const currentPrice = quote.price;
            const currentVolume = quote.volume;
            const prevClose = history[history.length - 1].close;

            // 2. Volume Anomaly (> 1.5x of 22D Average)
            const avgVol22 = DomainMath.getVolumeSMA(history, 22);
            const isVolSpike = currentVolume > (avgVol22 * 1.5);

            // 3. Price Anomaly
            // A: Change from Prev Close > 5%
            const changeFromPrev = Math.abs((currentPrice - prevClose) / prevClose) * 100;
            const isPriceJump = changeFromPrev > 5.0;

            // B: Deviation from 5D SMA (Weekly Trend) > 3%
            const sma5 = DomainMath.getSMA(history, 5);
            const devFromWeekly = Math.abs((currentPrice - sma5) / (sma5 || 1)) * 100;
            const isWeeklyAnomaly = devFromWeekly > 3.0;

            // 4. Send Notification if Triggered
            if (isVolSpike || isPriceJump || isWeeklyAnomaly) {
                let alertMsg = `🚨 <b>SENTINEL: Deteksi Anomali @ ${symbol.replace('.JK', '')}</b>\n\n`;
                alertMsg += `💰 Harga: Rp ${currentPrice.toLocaleString('id-ID')} (${(quote.changePercent || 0).toFixed(2)}%)\n`;

                if (isVolSpike) {
                    const volX = (currentVolume / avgVol22).toFixed(1);
                    alertMsg += `📊 <b>Volume Spike!</b> (${volX}x rata-rata 1 bulan)\n`;
                }

                if (isPriceJump) {
                    alertMsg += `⚡ <b>Price Jump!</b> (${changeFromPrev.toFixed(1)}% dari closing kemarin)\n`;
                }

                if (isWeeklyAnomaly && !isPriceJump) {
                    alertMsg += `📉 <b>Trend Deviation!</b> (${devFromWeekly.toFixed(1)}% melenceng dari MA-5)\n`;
                }

                alertMsg += `\n<i>👉 Cek /analyze ${symbol} segera!</i>`;

                await this.messenger.sendToUser(telegramId, alertMsg);
                logger.info(`🔔 Sentinel alerted ${telegramId} about ${symbol}`);
            }

        } catch (error: any) {
            // Silently fail for individual stock errors to keep sentinel running
            logger.warn(`[Sentinel] Failed checking ${symbol}: ${error.message}`);
        }
    }
}
