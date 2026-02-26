import { ITickerRepository } from '../../core/domain/interfaces/TickerRepository';
import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { IStrategy } from '../../core/domain/interfaces/Strategy';
import { OHLCV, Signal } from '../../core/domain/entities/MarketData';
import { logger } from '../../infrastructure/logging/WinstonLogger';
import { YahooFinanceProvider } from '../../infrastructure/external/YahooFinanceProvider';
import { DomainMath } from '../../core/domain/logic/Math';

export class PerformManualAnalysis {
    constructor(
        private tickerRepo: ITickerRepository,
        private marketData: IMarketDataProvider,
        private strategy: IStrategy
    ) { }

    async execute(symbol: string, indexData?: OHLCV[]): Promise<Signal | null> {
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
                const jkseData = indexData || await this.marketData.fetchHistoricalData('^JKSE', startDate);
                if (jkseData && jkseData.length > 0) {
                    const jkseClose = jkseData[jkseData.length - 1].close || 0;
                    const jkseSMA = jkseData.slice(-50).reduce((a, b) => a + (b.close || 0), 0) / 50;
                    isMarketBullish = jkseClose > jkseSMA;
                }
            } catch {
                logger.warn('JKSE unavailable, defaulting regime to BULLISH for analysis');
            }

            // 5. Calculate Indicators
            const adx = DomainMath.getADX(stockData, 14);
            const patterns = DomainMath.detectPatterns(stockData);
            const financials = this.marketData.fetchFinancials ? await this.marketData.fetchFinancials(symbol) : null;

            // 6. Calculate Signal
            const signal = this.strategy.calculateSignal(ticker as any, stockData, isMarketBullish);

            // 7. Inject real-time price into signal
            if (realTimePrice > 0) {
                signal.price = realTimePrice;
            }
            signal.timestamp = new Date();

            // 8. Inject extra metadata
            (signal as any).realTimeData = {
                name: stockName,
                currentPrice: realTimePrice,
                changePercent: changePercent.toFixed(2),
                volume,
                dataPoints: stockData.length,
                adx: adx.toFixed(1),
                patterns,
                brokerSummary: DomainMath.getBrokerSummaryLabel(stockData),
                smartMoney: {
                    intensity: DomainMath.getSmartMoneyIntensity(stockData, 20),
                    isAccumulating: DomainMath.detectQuietAccumulation(stockData)
                },
                financials: {
                    pe: financials?.pe?.toFixed(2) || '-',
                    pb: financials?.pb && financials.pb < 10000 ? financials.pb.toFixed(2) : '-',
                    eps: financials?.eps?.toFixed(2) || '-',
                    marketCap: financials?.marketCap || 0,
                    sector: financials?.sector || 'Tidak Tersedia',
                    industry: financials?.industry || 'Tidak Tersedia',
                    dividendYield: financials?.dividendYield || 0,
                    bookValue: financials?.bookValue || 0,
                    sharesOutstanding: financials?.sharesOutstanding || 0
                },
                alphaScore: DomainMath.calculatePrimeAlphaScore({
                    technicalStrength: adx + (signal.type === 'BUY' ? 20 : 0),
                    fundamentalRating: financials?.pb && financials.pb < 5 ? 7 : 5,
                    sentimentScore: DomainMath.calculateMarketSentiment(stockData).score,
                    institutionalIntensity: DomainMath.getSmartMoneyIntensity(stockData, 20)
                }),
                // Trading Levels (v10.1 Tuned Logic)
                tradingLevels: (() => {
                    const atr = DomainMath.getATR(stockData, 14);
                    const entry = realTimePrice || stockData[stockData.length - 1]?.close || 0;

                    // V10.1: Institutional Risk Distance
                    // Safe Risk Distance = Max(2.5x ATR, Distance to Kijun-sen)
                    const stopDistanceATR = atr * 2.5;
                    const kijunLevel = signal.breakdown?.kijunLevel || 0;
                    const stopDistanceKijun = kijunLevel > 0 ? Math.abs(entry - kijunLevel) : 0;

                    // Logic: Use 2.5x ATR as the floor, but if Kijun is further away, it's safer for trend-following
                    const stopDistance = Math.max(stopDistanceATR, stopDistanceKijun);

                    const sl = Math.round(entry - stopDistance);
                    const risk = entry - sl;

                    return {
                        entry: Math.round(entry),
                        sl,
                        tp1: Math.round(entry + risk * 1),     // RR 1:1
                        tp2: Math.round(entry + risk * 2),     // RR 1:2
                        tp3: Math.round(entry + risk * 3),     // RR 1:3
                        atr: Math.round(atr),
                        kijun: Math.round(kijunLevel),
                        riskPercent: entry > 0 ? ((stopDistance / entry) * 100).toFixed(2) : '0',
                        isV10Logical: true
                    };
                })()
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
