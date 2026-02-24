import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { DomainMath } from '../../core/domain/logic/Math';
import { logger } from '../../infrastructure/logging/WinstonLogger';

export interface SentimentReport {
    symbol: string;
    compositeScore: number;
    compositeLabel: 'EXTREME_GREED' | 'GREED' | 'NEUTRAL' | 'FEAR' | 'EXTREME_FEAR';
    news: {
        score: number;
        label: string;
        bullishCount: number;
        bearishCount: number;
        totalAnalyzed: number;
        headlines: string[];
    };
    market: {
        score: number;
        label: string;
        momentum: number;
        volumeTrend: number;
        volatilitySignal: number;
    };
    summary: string;
    source: 'HYBRID' | 'NEWS_ONLY' | 'MARKET_ONLY';
}

export class AnalyzeSentiment {
    constructor(private marketData: IMarketDataProvider) { }

    async execute(symbol: string): Promise<SentimentReport | null> {
        try {
            logger.info(`🧠 Analyzing sentiment for ${symbol}`);

            // 1. Fetch News Headlines
            let newsHeadlines: string[] = [];
            if (this.marketData.fetchNewsHeadlines) {
                const items = await this.marketData.fetchNewsHeadlines(symbol);
                newsHeadlines = items.map(n => n.title).filter(t => t.length > 0);
            }

            // 2. Fetch Historical Data for Market Sentiment
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 60);
            const historicalData = await this.marketData.fetchHistoricalData(symbol, startDate);

            // 3. NLP Headline Analysis
            const nlpResult = DomainMath.analyzeSentimentFromHeadlines(newsHeadlines);

            // 4. Market-Derived Sentiment
            const marketResult = DomainMath.calculateMarketSentiment(historicalData);

            // 5. Composite Score
            let compositeScore: number;
            let source: 'HYBRID' | 'NEWS_ONLY' | 'MARKET_ONLY';

            if (newsHeadlines.length > 0 && historicalData.length >= 20) {
                // Hybrid: 40% News + 60% Market (market data is more reliable for IDX)
                compositeScore = Math.round((nlpResult.score * 0.4) + (marketResult.score * 0.6));
                source = 'HYBRID';
            } else if (newsHeadlines.length > 0) {
                compositeScore = nlpResult.score;
                source = 'NEWS_ONLY';
            } else {
                compositeScore = marketResult.score;
                source = 'MARKET_ONLY';
            }

            compositeScore = Math.max(-100, Math.min(100, compositeScore));

            let compositeLabel: 'EXTREME_GREED' | 'GREED' | 'NEUTRAL' | 'FEAR' | 'EXTREME_FEAR' = 'NEUTRAL';
            if (compositeScore >= 60) compositeLabel = 'EXTREME_GREED';
            else if (compositeScore >= 20) compositeLabel = 'GREED';
            else if (compositeScore <= -60) compositeLabel = 'EXTREME_FEAR';
            else if (compositeScore <= -20) compositeLabel = 'FEAR';

            const summary = this.generateSummary(compositeLabel, compositeScore, source);

            return {
                symbol,
                compositeScore,
                compositeLabel,
                news: {
                    score: nlpResult.score,
                    label: nlpResult.label,
                    bullishCount: nlpResult.bullishCount,
                    bearishCount: nlpResult.bearishCount,
                    totalAnalyzed: nlpResult.totalAnalyzed,
                    headlines: newsHeadlines.slice(0, 5)
                },
                market: {
                    score: marketResult.score,
                    label: marketResult.label,
                    momentum: marketResult.momentum,
                    volumeTrend: marketResult.volumeTrend,
                    volatilitySignal: marketResult.volatilitySignal
                },
                summary,
                source
            };

        } catch (error: any) {
            logger.error(`Sentiment analysis failed for ${symbol}: ${error.message}`);
            return null;
        }
    }

    private generateSummary(label: string, score: number, source: string): string {
        const sourceTag = source === 'HYBRID' ? 'News + Market' : source === 'NEWS_ONLY' ? 'News' : 'Market Data';
        if (label === 'EXTREME_GREED') return `Extreme Greed detected (${sourceTag}). Market euphoria — exercise caution on entries.`;
        if (label === 'GREED') return `Bullish sentiment (${sourceTag}). Positive momentum supports upside bias.`;
        if (label === 'FEAR') return `Bearish sentiment (${sourceTag}). Caution advised — consider defensive positioning.`;
        if (label === 'EXTREME_FEAR') return `Extreme Fear detected (${sourceTag}). Potential capitulation — contrarian opportunity.`;
        return `Neutral sentiment (${sourceTag}). No strong directional bias detected.`;
    }
}
