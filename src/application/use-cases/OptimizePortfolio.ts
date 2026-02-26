import { ITickerRepository } from '../../core/domain/interfaces/TickerRepository';
import { DomainTicker } from '../../core/domain/entities/Ticker';
import { DomainMath } from '../../core/domain/logic/Math';
import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { IStrategy } from '../../core/domain/interfaces/Strategy';
import { logger } from '../../infrastructure/logging/WinstonLogger';

export interface SwapRecommendation {
    currentSymbol: string;
    currentAlpha: number;
    recommendedSymbol: string;
    recommendedAlpha: number;
    reason: string;
}

export interface OptimizationReport {
    userId: string;
    portfolioHealth: number; // Avg Alpha of holdings
    recommendations: SwapRecommendation[];
}

export class OptimizePortfolio {
    constructor(
        private tickerRepo: ITickerRepository,
        private marketData: IMarketDataProvider,
        private strategy: IStrategy
    ) { }

    async execute(userId: string): Promise<OptimizationReport> {
        const allTickers = await this.tickerRepo.findAll(userId);
        const holdings = allTickers.filter(t => t.state.isHolding);
        const candidates = allTickers.filter(t => !t.state.isHolding);

        const report: OptimizationReport = {
            userId,
            portfolioHealth: 0,
            recommendations: []
        };

        if (holdings.length === 0) return report;

        // 1. Calculate Alpha for holdings
        const holdingsWithAlpha = await this.calculateBatchAlpha(holdings);
        const avgAlpha = holdingsWithAlpha.reduce((sum, h) => sum + h.alpha, 0) / holdingsWithAlpha.length;
        report.portfolioHealth = Math.round(avgAlpha);

        // 2. Calculate Alpha for candidates
        const candidatesWithAlpha = await this.calculateBatchAlpha(candidates);

        // 3. Find Swap Opportunities
        // Rule: If Portfolio Alpha < 45, swap for top candidates with Alpha Spread > 20
        const sortedCandidates = candidatesWithAlpha.sort((a, b) => b.alpha - a.alpha);

        holdingsWithAlpha.filter(h => h.alpha < 45).forEach((h, idx) => {
            const candidate = sortedCandidates[idx];
            // Only swap if candidate is significantly better (Alpha Spread > 25)
            if (candidate && (candidate.alpha - h.alpha) >= 25) {
                report.recommendations.push({
                    currentSymbol: h.ticker.config.symbol,
                    currentAlpha: Math.round(h.alpha),
                    recommendedSymbol: candidate.ticker.config.symbol,
                    recommendedAlpha: Math.round(candidate.alpha),
                    reason: `Alpha Optimization: ${h.ticker.config.symbol} (${Math.round(h.alpha)}α) underperforming. Swap for ${candidate.ticker.config.symbol} (${Math.round(candidate.alpha)}α) for a +${Math.round(candidate.alpha - h.alpha)} conviction boost.`
                });
            }
        });

        return report;
    }

    private async calculateBatchAlpha(tickers: DomainTicker[]): Promise<{ ticker: DomainTicker, alpha: number }[]> {
        const results: { ticker: DomainTicker, alpha: number }[] = [];
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 100);

        for (const ticker of tickers) {
            try {
                const data = await this.marketData.fetchHistoricalData(ticker.config.symbol, startDate);
                if (data.length < 50) continue;

                // 1. Technical Strength (ADX + Ichimoku)
                const adx = DomainMath.getADX(data, 14);
                const technicalStrength = Math.min(100, adx * 2.5); // Proxy

                // 2. Fundamental Rating (Synthetic Proxy)
                const financials = await this.marketData.fetchFinancials?.(ticker.config.symbol);
                let fScore = 0;
                if (financials) {
                    if ((financials.eps || 0) > 0) fScore += 2;
                    if ((financials.pe || 0) > 0 && (financials.pe || 0) < 15) fScore += 2;
                    if ((financials.pb || 0) > 0 && (financials.pb || 0) < 2) fScore += 2;
                    if ((financials.dividendYield || 0) > 0.02) fScore += 2;
                }
                const fundamentalRating = fScore; // 0-8 scale fits OK in 0-10 metric

                // 3. Sentiment & Institutional
                const sentimentScore = DomainMath.calculateMarketSentiment(data).score; // Market-only sentiment
                const institutionalIntensity = DomainMath.getSmartMoneyIntensity(data, 20);

                const alpha = DomainMath.calculatePrimeAlphaScore({
                    technicalStrength,
                    fundamentalRating,
                    sentimentScore,
                    institutionalIntensity
                });

                results.push({ ticker, alpha });
            } catch (err) {
                logger.error(`Error calculating Alpha for ${ticker.config.symbol}: ${err}`);
            }
        }
        return results;
    }
}
