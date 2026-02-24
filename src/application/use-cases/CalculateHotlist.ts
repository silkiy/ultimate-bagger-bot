import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { DomainMath } from '../../core/domain/logic/Math';
import { logger } from '../../infrastructure/logging/WinstonLogger';

export interface HotItem {
    symbol: string;
    price: number;
    changePercent: number;
    volumeSurge: number;
    momentum: 'UP' | 'DOWN' | 'FLAT';
    patterns: string[];
}

export class CalculateHotlist {
    constructor(private marketData: IMarketDataProvider) { }

    async execute(): Promise<HotItem[]> {
        logger.info('🔥 Executing Market Hotlist (Fast Money Discovery)');

        try {
            // 1. Fetch Candidates (Trending + Gainers)
            const trending = await this.marketData.fetchTopActiveSymbols?.('ID') || [];
            const gainers = await this.marketData.fetchTopGainers?.('ID') || [];

            const rawCandidates = [...new Set([...trending, ...gainers])];
            const candidates = rawCandidates.slice(0, 30); // Limiting for speed

            // 2. Parallel Analysis
            const results = await Promise.all(candidates.map(async (symbol) => {
                try {
                    const startDate = new Date();
                    startDate.setDate(startDate.getDate() - 30);

                    const data = await this.marketData.fetchHistoricalData(symbol, startDate);
                    if (data.length < 15) return null;

                    const quote = await this.marketData.fetchRealTimeQuote?.(symbol);
                    if (!quote) return null;

                    // Calculate Speed Metrics
                    const volumeSurge = DomainMath.calculateVolumeSurge(data, 10);
                    const patterns = DomainMath.detectPatterns(data);

                    // Simple Momentum
                    const close = quote.price;
                    const sma10 = DomainMath.getSMA(data, 10);
                    const momentum = close > sma10 ? 'UP' : close < (sma10 * 0.95) ? 'DOWN' : 'FLAT';

                    return {
                        symbol,
                        price: quote.price,
                        changePercent: quote.changePercent,
                        volumeSurge,
                        momentum,
                        patterns
                    };
                } catch {
                    return null;
                }
            }));

            // 3. Filter & Rank (High Volume Surge + Positive Momentum)
            return results
                .filter((r): r is HotItem => r !== null && r.volumeSurge > 0.5)
                .sort((a, b) => b.volumeSurge - a.volumeSurge)
                .slice(0, 10);

        } catch (error: any) {
            logger.error(`Hotlist calculation error: ${error.message}`);
            return [];
        }
    }
}
