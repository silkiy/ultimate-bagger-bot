import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { ITickerRepository } from '../../core/domain/interfaces/TickerRepository';
import { DomainMath } from '../../core/domain/logic/Math';
import { logger } from '../../infrastructure/logging/WinstonLogger';
import { DomainTicker } from '../../core/domain/entities/Ticker';

export interface SystemicRiskReport {
    totalPositions: number;
    correlationMatrix: { [pair: string]: number };
    highestCorrelation: { pair: string; value: number } | null;
    avgCorrelation: number;
    diversificationScore: number; // 0-100
    warnings: string[];
}

export class AnalyzeSystemicRisk {
    constructor(
        private tickerRepo: ITickerRepository,
        private marketData: IMarketDataProvider
    ) { }

    async execute(userId: string): Promise<SystemicRiskReport> {
        const tickers = await this.tickerRepo.findAll(userId);
        const holdings = tickers.filter(t => t.state.isHolding);

        if (holdings.length < 2) {
            return {
                totalPositions: holdings.length,
                correlationMatrix: {},
                highestCorrelation: null,
                avgCorrelation: 0,
                diversificationScore: 100,
                warnings: holdings.length === 1 ? [] : ['Belum ada posisi aktif untuk dianalisis.']
            };
        }

        const priceHistory: { [symbol: string]: Map<string, number> } = {};
        const matrix: { [pair: string]: number } = {};

        // Fetch 30 days of data for correlation analysis
        for (const t of holdings as DomainTicker[]) {
            try {
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 40); // 40 days to ensure enough trading days
                const history = await this.marketData.fetchHistoricalData(t.config.symbol, startDate);

                const historyMap = new Map<string, number>();
                history.forEach(h => {
                    const dateStr = h.date.toISOString().split('T')[0];
                    historyMap.set(dateStr, h.close);
                });
                priceHistory[t.config.symbol] = historyMap;
            } catch (err) {
                logger.warn(`Failed to fetch history for ${t.config.symbol} during risk audit`);
            }
        }

        const symbols = Object.keys(priceHistory);
        let sumCorr = 0;
        let count = 0;
        let highest: { pair: string; value: number } | null = null;

        for (let i = 0; i < symbols.length; i++) {
            for (let j = i + 1; j < symbols.length; j++) {
                const symA = symbols[i];
                const symB = symbols[j];

                // Align dates
                const historyA = priceHistory[symA];
                const historyB = priceHistory[symB];

                const commonDates = Array.from(historyA.keys())
                    .filter(date => historyB.has(date))
                    .sort();

                if (commonDates.length < 5) continue; // Not enough data points to correlate

                const pricesA = commonDates.map(d => historyA.get(d)!);
                const pricesB = commonDates.map(d => historyB.get(d)!);

                const corr = DomainMath.calculateCorrelation(pricesA, pricesB);

                const pair = `${symA.replace('.JK', '')}/${symB.replace('.JK', '')}`;
                matrix[pair] = corr;
                sumCorr += corr;
                count++;

                if (!highest || corr > highest.value) {
                    highest = { pair, value: corr };
                }
            }
        }

        const avgCorrelation = count > 0 ? sumCorr / count : 0;
        // Diversification score: lower correlation is better.
        // If avg correlation is 1.0 (perfectly correlated), score is 0.
        // If avg correlation is 0.0 (uncorrelated), score is 100.
        const diversificationScore = Math.max(0, Math.min(100, (1 - avgCorrelation) * 100));

        const warnings: string[] = [];
        if (avgCorrelation > 0.7) {
            warnings.push('⚠️ High Cluster Risk: Posisi Anda bergerak sangat kompak. Diversifikasi rendah.');
        }
        if (highest && highest.value > 0.85) {
            warnings.push(`🚨 Systemic Danger: Pair ${highest.pair} hampir identik (${(highest.value * 100).toFixed(1)}%). Hapus salah satu untuk mengurangi resiko.`);
        }

        return {
            totalPositions: holdings.length,
            correlationMatrix: matrix,
            highestCorrelation: highest,
            avgCorrelation,
            diversificationScore,
            warnings
        };
    }
}
