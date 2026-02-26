import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { DomainMath } from '../../core/domain/logic/Math';
import { logger } from '../../infrastructure/logging/WinstonLogger';

export interface WhaleSignal {
    symbol: string;
    intensity: number;
    isAccumulating: boolean;
    price: number;
    changePercent: number;
    volume: number;
    name: string;
}

export class ScanWhaleActivity {
    constructor(private marketData: IMarketDataProvider) { }

    async execute(): Promise<WhaleSignal[]> {
        logger.info('🐋 [Whale-Radar] Scanning for institutional accumulation patterns...');

        try {
            // 1. Discover core universe (Liquidity is key for whales)
            let symbols: string[] = [];
            if (this.marketData.fetchTopActiveSymbols) {
                symbols = await this.marketData.fetchTopActiveSymbols('ID');
            }

            if (symbols.length === 0) return [];

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30); // Last 30 days for intensity

            // 2. Scan each symbol (Chunked parallel to avoid rate limits)
            const results: WhaleSignal[] = [];
            const chunkSize = 5;

            for (let i = 0; i < symbols.length; i += chunkSize) {
                const chunk = symbols.slice(i, i + chunkSize);
                const chunkTasks = chunk.map(async (symbol) => {
                    try {
                        const [history, quote] = await Promise.all([
                            this.marketData.fetchHistoricalData(symbol, startDate),
                            this.marketData.fetchRealTimeQuote ? this.marketData.fetchRealTimeQuote(symbol) : null
                        ]);

                        if (!history || history.length < 20 || !quote) return null;

                        const intensity = DomainMath.getSmartMoneyIntensity(history, 20);
                        const isAccumulating = DomainMath.detectQuietAccumulation(history);

                        // Only interested in significant signatures
                        if (intensity > 30 || isAccumulating) {
                            return {
                                symbol,
                                intensity,
                                isAccumulating,
                                price: quote.price,
                                changePercent: quote.changePercent,
                                volume: quote.volume,
                                name: quote.name
                            };
                        }
                        return null;
                    } catch (err: any) {
                        return null;
                    }
                });

                const chunkResults = await Promise.all(chunkTasks);
                results.push(...chunkResults.filter((r): r is WhaleSignal => r !== null));
            }

            // 3. Rank by Intensity DESC
            return results.sort((a, b) => b.intensity - a.intensity).slice(0, 10);

        } catch (error: any) {
            logger.error(`[Whale-Radar] Execution failed: ${error.message}`);
            return [];
        }
    }
}
