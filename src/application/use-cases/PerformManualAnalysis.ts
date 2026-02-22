import { ITickerRepository } from '../../core/domain/interfaces/TickerRepository';
import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { IStrategy } from '../../core/domain/interfaces/Strategy';
import { Signal } from '../../core/domain/entities/MarketData';
import { logger } from '../../infrastructure/logging/WinstonLogger';
import { YahooFinanceProvider } from '../../infrastructure/external/YahooFinanceProvider';

export class PerformManualAnalysis {
    constructor(
        private tickerRepo: ITickerRepository,
        private marketData: IMarketDataProvider,
        private strategy: IStrategy
    ) { }

    async execute(symbol: string): Promise<Signal | null> {
        logger.info(`🔍 Manual Analysis requested for ${symbol}`);

        try {
            // 1. Get or create a temporary ticker config for any Yahoo symbol
            let ticker = await this.tickerRepo.findBySymbol(symbol);

            if (!ticker) {
                // Create a temporary in-memory ticker (NOT saved to DB) for analysis
                ticker = {
                    config: {
                        symbol,
                        tenkanPeriod: 8,
                        kijunPeriod: 21,
                        spanBPeriod: 55,
                        displacement: 26,
                        trailPercent: 0.10,
                        entryRule: 'AGGRESSIVE',
                        sizingMode: 'RISK_BASED',
                        riskPerTrade: 0.015,
                        useVolEntry: true,
                        useVolExit: true,
                        useExitKijun: true,
                        useTrailing: true,
                        volEntryMult: 1.2,
                        volDistMult: 1.5,
                        atrMultiplier: 2.0
                    },
                    account: {
                        initialCapital: 10000000,
                        currentBalance: 10000000,
                        reservedCash: 0,
                        isCompounding: true,
                        peakEquity: 10000000,
                        dailyPeakEquity: 10000000,
                        dailyStartEquity: 10000000,
                        lockedCapital: 0
                    },
                    state: {
                        isHolding: false,
                        entryPrice: 0,
                        highestPrice: 0,
                        lots: 0,
                        lastExitPrice: 0,
                        consecutiveLosses: 0,
                        equityHistory: [],
                        pyramidEntries: 0,
                        atrHistory: []
                    },
                    analytics: {
                        totalTrades: 0,
                        winRate: 0,
                        recentTrades: [],
                        profitFactor: 0,
                        maxDrawdown: 0,
                        avgWin: 0,
                        avgLoss: 0,
                        expectancy: 0
                    },
                    risk: { maxExposure: 0, currentHeat: 0 }
                } as any;
                logger.info(`📝 Symbol ${symbol} not in DB. Running analysis with default config.`);
            }

            // 2. Fetch real-time quote for accurate current price
            const provider = this.marketData as YahooFinanceProvider;
            let realTimePrice = 0;
            let stockName = symbol;
            let changePercent = 0;
            let volume = 0;

            if (provider.fetchRealTimeQuote) {
                const quote = await provider.fetchRealTimeQuote(symbol);
                if (quote) {
                    realTimePrice = quote.price;
                    stockName = quote.name;
                    changePercent = quote.changePercent;
                    volume = quote.volume;
                }
            }

            // 3. Fetch historical OHLCV for Ichimoku calculation
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 180);
            const stockData = await this.marketData.fetchHistoricalData(symbol, startDate);

            if (!stockData || stockData.length < 50) {
                logger.warn(`Insufficient data for ${symbol}: ${stockData?.length ?? 0} records`);
                return {
                    symbol,
                    type: 'HOLD',
                    price: realTimePrice,
                    reason: `Insufficient historical data (${stockData?.length ?? 0} records found, need 50+)`,
                    timestamp: new Date()
                };
            }

            // Override last close with real-time price if available
            if (realTimePrice > 0 && stockData.length > 0) {
                stockData[stockData.length - 1].close = realTimePrice;
                stockData[stockData.length - 1].adjclose = realTimePrice;
                stockData[stockData.length - 1].volume = volume || stockData[stockData.length - 1].volume;
            }

            // 4. Market Regime Check
            let isMarketBullish = true; // Default to allow analysis
            try {
                const jkseData = await this.marketData.fetchHistoricalData('^JKSE', startDate);
                if (jkseData && jkseData.length > 0) {
                    const jkseClose = jkseData[jkseData.length - 1].close || 0;
                    const jkseSMA = jkseData.slice(-50).reduce((a, b) => a + (b.close || 0), 0) / 50;
                    isMarketBullish = jkseClose > jkseSMA;
                }
            } catch {
                logger.warn('JKSE unavailable, defaulting regime to BULLISH for analysis');
            }

            // 5. Calculate Signal
            const signal = this.strategy.calculateSignal(ticker as any, stockData, isMarketBullish);

            // 6. Inject real-time price into signal
            if (realTimePrice > 0) {
                signal.price = realTimePrice;
            }

            // 7. Inject extra metadata
            (signal as any).realTimeData = {
                name: stockName,
                currentPrice: realTimePrice,
                changePercent: changePercent.toFixed(2),
                volume,
                dataPoints: stockData.length
            };

            // 8. Log signal to DB only if ticker exists in DB
            if (await this.tickerRepo.findBySymbol(symbol)) {
                await this.tickerRepo.logSignal({
                    symbol,
                    type: signal.type,
                    price: signal.price,
                    confidence: signal.confidence?.total || 0,
                    timestamp: new Date(),
                    metadata: signal.breakdown
                });
            }

            return signal;
        } catch (error: any) {
            logger.error(`Manual analysis error for ${symbol}: ${error.message}`);
            return null;
        }
    }
}
