import { ITickerRepository } from '../../core/domain/interfaces/TickerRepository';
import { IMarketDataProvider, IMessagingService } from '../../core/domain/interfaces/ExternalServices';
import { IStrategy } from '../../core/domain/interfaces/Strategy';
import { DomainTicker, EntryRule } from '../../core/domain/entities/Ticker';
import { OHLCV, Signal } from '../../core/domain/entities/MarketData';
import { RiskEngine } from '../../core/domain/logic/RiskEngine';
import { MarketRegime, RegimeCapitalAllocator, LosingStreakTracker } from '../../core/domain/logic/CapitalPreservation';
import { CompoundingOptimizer, EquityMomentumFilter } from '../../core/domain/logic/CompoundingOptimization';
import { AccelerationGuard, PyramidingLogic, VolatilityGuard } from '../../core/domain/logic/GrowthAcceleration';
import { logger } from '../../infrastructure/logging/WinstonLogger';
import { DomainMath } from '../../core/domain/logic/Math';

interface AnalyzedTicker {
    ticker: DomainTicker;
    signal: Signal;
    stockData: OHLCV[];
    score: number;
    atr: number;
    adx: number;
    sector?: string;
}

export interface ScanSignalItem {
    symbol: string;
    type: 'BUY' | 'SELL' | 'HOLD';
    price: number;
    confidence?: number;
    reason: string;
    lots?: number;
    breakdown?: any;
}

export interface RankedItem {
    symbol: string;
    signal: 'BUY' | 'SELL' | 'HOLD';
    score: number;
    alphaScore: number;
    price: number;
    inDb: boolean;
    adx: number;
    sector?: string;
}

export interface ScanReport {
    regime: string;
    marketBreadth: number;
    totalScanned: number;
    buySignals: ScanSignalItem[];
    sellSignals: ScanSignalItem[];
    rankedItems: RankedItem[];
    elitePicks: RankedItem[];
    watchlist: string[];
    timestamp: Date;
}

function buildDefaultTicker(symbol: string): DomainTicker {
    return {
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
}

export class RunScanner {
    constructor(
        private tickerRepo: ITickerRepository,
        private marketData: IMarketDataProvider,
        private strategy: IStrategy,
        private messenger: IMessagingService
    ) { }

    private async hasWeeklyTrend(ticker: DomainTicker): Promise<boolean> {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 365); // 1 year for weekly
            const weeklyData = await this.marketData.fetchHistoricalData(ticker.config.symbol, startDate, '1wk');
            if (!weeklyData || weeklyData.length < 20) return true; // Fallback if no data

            const latest = weeklyData[weeklyData.length - 1];
            const close = latest.adjclose || latest.close || 0;
            const sma50 = DomainMath.getSMA(weeklyData, 50);

            // Weekly Trend: Price > SMA50 Weekly
            return sma50 === 0 || close > sma50;
        } catch (err) {
            logger.warn(`⚠️ Weekly trend check failed for ${ticker.config.symbol}: ${err}`);
            return true; // Conservative fallback
        }
    }

    async execute(): Promise<ScanReport> {
        logger.info('🚀 Starting Compounding Optimization Engine (V7.0)');

        const report: ScanReport = {
            regime: 'SIDEWAYS',
            marketBreadth: 0,
            totalScanned: 0,
            buySignals: [],
            sellSignals: [],
            rankedItems: [],
            elitePicks: [],
            watchlist: [],
            timestamp: new Date()
        };

        try {
            // 1. Dynamic Ticker Discovery (Yahoo Most Active) + DB tickers
            const dbTickers = await this.tickerRepo.findAll();
            const dbSymbols = new Set(dbTickers.map(t => t.config.symbol));

            let dynamicSymbols: string[] = [];
            if (this.marketData.fetchTopActiveSymbols) {
                dynamicSymbols = await this.marketData.fetchTopActiveSymbols('ID');
            }

            // Buat ticker sementara untuk symbol universe yang belum ada di DB
            const extraTickers: DomainTicker[] = dynamicSymbols
                .filter((sym: string) => !dbSymbols.has(sym))
                .map((sym: string) => buildDefaultTicker(sym));

            const tickers: DomainTicker[] = [...dbTickers, ...extraTickers];
            report.watchlist = tickers.map(t => t.config.symbol);

            logger.info(`📋 Total Universe: ${tickers.length} (DB: ${dbTickers.length}, Dynamic: ${extraTickers.length})`);

            // 2. Portfolio Heat Check (hanya dari DB tickers)
            const heat = RiskEngine.calculatePortfolioHeat(dbTickers);
            logger.info(`🔥 Portfolio Heat: ${heat.toFixed(4)}`);

            // 3. Market Regime
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 150);

            let regime = MarketRegime.SIDEWAYS;
            try {
                logger.info('📊 Fetching Market Index (^JKSE)...');
                const jkseData = await this.marketData.fetchHistoricalData('^JKSE', startDate);
                logger.info(`✅ Index Data Received: ${jkseData.length} records`);
                if (jkseData && jkseData.length > 0) {
                    const jkseClose = jkseData[jkseData.length - 1].close || 0;
                    const jkseSMA = jkseData.slice(-50).reduce((a, b) => a + (b.close || 0), 0) / 50;
                    const jkseSMA200 = jkseData.slice(-100).reduce((a, b) => a + (b.close || 0), 0) / 100;

                    if (jkseClose > jkseSMA && jkseClose > jkseSMA200) regime = MarketRegime.BULL;
                    else if (jkseClose < jkseSMA && jkseClose < jkseSMA200) regime = MarketRegime.BEAR;
                }
            } catch {
                logger.warn('⚠️ JKSE Unavailable. Defaulting to SIDEWAYS.');
            }

            report.regime = regime;
            logger.info(`🌐 Market Regime: ${regime}`);

            // 3.1 Regime Auto-Pilot (v13.0)
            await this.applyRegimeAutoPilot(dbTickers, regime);

            const capitalFactor = RegimeCapitalAllocator.getAllowedCapitalFactor(regime);
            const isMarketBullish = regime === MarketRegime.BULL;

            // 4. Pre-Analysis (Ranking) — Chunked parallel fetch
            logger.info(`🔬 Analyzing ${tickers.length} tickers in chunks of 5...`);
            const tickerResults: any[] = [];
            const chunkSize = 5;

            for (let i = 0; i < tickers.length; i += chunkSize) {
                const chunk = tickers.slice(i, i + chunkSize);
                logger.info(`📡 Processing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(tickers.length / chunkSize)}...`);

                const chunkResults = await Promise.all(chunk.map(async (ticker: DomainTicker) => {
                    try {
                        logger.debug(`📡 Fetching ${ticker.config.symbol}...`);
                        const stockData = await this.marketData.fetchHistoricalData(ticker.config.symbol, startDate);
                        if (!stockData || stockData.length < 50) {
                            logger.warn(`⚠️ Insufficient data for ${ticker.config.symbol}: ${stockData?.length ?? 0} records`);
                            return null;
                        }

                        const latestBar = stockData[stockData.length - 1];
                        const currentPrice = latestBar.adjclose || latestBar.close || 0;

                        // ── Filter: harga >= 1000 & likuid (avg volume >= 1 juta/hari) ──
                        const avgVolume = stockData.slice(-20).reduce((s, b) => s + (b.volume || 0), 0) / 20;
                        if (currentPrice < 1000) {
                            logger.debug(`⏭️ Skip ${ticker.config.symbol}: harga Rp${currentPrice} < 1000`);
                            return null;
                        }
                        if (avgVolume < 1_000_000) {
                            logger.debug(`⏭️ Skip ${ticker.config.symbol}: avg volume ${(avgVolume / 1e6).toFixed(2)}M < 1M (tidak likuid)`);
                            return null;
                        }

                        const signal = this.strategy.calculateSignal(ticker, stockData, isMarketBullish);
                        const atr = DomainMath.getATR(stockData, 14);
                        const adx = DomainMath.getADX(stockData, 14);
                        const sma50 = DomainMath.getSMA(stockData, 50);
                        const score = CompoundingOptimizer.calculateRankingScore(ticker, signal, atr);

                        let sector: string | undefined;
                        let fundamentalRating = 5; // Default neutral
                        let epsValue = 0;
                        if (this.marketData.fetchFinancials) {
                            const financials = await this.marketData.fetchFinancials(ticker.config.symbol);
                            if (financials) {
                                if ((financials.eps || 0) < -5000) {
                                    logger.debug(`⏭️ Skip ${ticker.config.symbol}: Extreme negative EPS (${financials.eps})`);
                                    return null;
                                }
                                sector = financials.sector;
                                epsValue = financials.eps || 0;
                                // Basic normalization for fundamental rating (0-10)
                                fundamentalRating = financials.pb && financials.pb < 5 ? 7 : 5;
                                if (financials.pe && financials.pe < 15) fundamentalRating += 1;
                            }
                        }

                        const sent = DomainMath.calculateMarketSentiment(stockData);
                        const intensity = DomainMath.getSmartMoneyIntensity(stockData, 20);

                        const alphaScore = DomainMath.calculatePrimeAlphaScore({
                            technicalStrength: adx + (signal.type === 'BUY' ? 20 : 0),
                            fundamentalRating,
                            sentimentScore: sent.score,
                            institutionalIntensity: intensity
                        });

                        // Safety: ensure signal has the latest price
                        if (!signal.price || signal.price === 0) {
                            signal.price = currentPrice;
                        }

                        logger.info(`📊 [Ranking] ${ticker.config.symbol}: Alpha ${alphaScore}, Signal: ${signal.type}, ADX: ${adx.toFixed(1)}, Price: Rp${currentPrice.toFixed(0)}`);
                        return { ticker, signal, stockData, score, atr, adx, sector, alphaScore, currentPrice, sma50 };
                    } catch (err: any) {
                        logger.error(`❌ Skip ${ticker.config.symbol}: ${err.message}`);
                        return null;
                    }
                }));

                tickerResults.push(...chunkResults);
            }

            const analyzedItems = tickerResults.filter((t) => t !== null) as any[];
            report.totalScanned = analyzedItems.length;

            // 4.1 Calculate Market Breadth
            report.marketBreadth = DomainMath.calculateMarketBreadth(analyzedItems.map(a => ({
                currentPrice: a.currentPrice,
                sma50: a.sma50
            })));
            logger.info(`📈 Market Breadth: ${report.marketBreadth}%`);

            // Clip to Top 20 Ranked Assets
            const rankedTickers = [...analyzedItems]
                .sort((a, b) => b.alphaScore - a.alphaScore)
                .slice(0, 20);

            // Populate rankedItems for Telegram display
            report.rankedItems = rankedTickers.map(({ ticker, signal, score, adx, sector, alphaScore }) => ({
                symbol: ticker.config.symbol,
                signal: signal.type,
                score,
                alphaScore,
                price: signal.price,
                inDb: dbSymbols.has(ticker.config.symbol),
                adx,
                sector
            }));

            // Identify Elite Picks (Top 3)
            report.elitePicks = report.rankedItems.slice(0, 3);

            logger.info(`🏆 Elite Picks: ${report.elitePicks.map(e => e.symbol).join(', ')}`);

            // 5. Signal Processing Loop
            for (const tickerItem of rankedTickers) {
                const { ticker, signal, stockData, score, atr, adx } = tickerItem;
                // Protection Guards
                const haltCheck = RiskEngine.checkSystemHalt(ticker);
                if (!haltCheck.canProceed) continue;

                if (!ticker.state.atrHistory) ticker.state.atrHistory = [];
                ticker.state.atrHistory.push(atr);
                if (ticker.state.atrHistory.length > 20) ticker.state.atrHistory.shift();

                const isVolatile = VolatilityGuard.isVolatile(atr, ticker.state.atrHistory);
                const canAccelerate = AccelerationGuard.canAccelerate(ticker, regime, heat) && !isVolatile;
                const price = stockData[stockData.length - 1].adjclose || stockData[stockData.length - 1].close || 0;

                // PYRAMIDING
                if (ticker.state.isHolding && PyramidingLogic.canPyramid(ticker, signal, price) && canAccelerate) {
                    const action = RiskEngine.calculateATRPositionSize(ticker, stockData, price, regime, true);
                    if (action.canProceed) {
                        const msg = `🚀 <b>TURBO: PYRAMID ENTRY</b>\nStock: ${ticker.config.symbol}\nPrice: ${price}\nAdd Lots: ${action.lots}`;
                        await this.messenger.sendAlert(msg);
                        ticker.state.lots += action.lots;
                        ticker.state.pyramidEntries = (ticker.state.pyramidEntries || 0) + 1;
                        ticker.account.currentBalance -= (action.lots * 100 * price);
                        if (dbSymbols.has(ticker.config.symbol)) await this.tickerRepo.save(ticker);
                        continue;
                    }
                }

                if (signal.type === 'BUY' && !ticker.state.isHolding) {
                    const eliteSymbols = report.elitePicks.map(e => e.symbol);
                    if (!eliteSymbols.includes(ticker.config.symbol)) continue;

                    // TREND STRENGTH (ADX) Filter
                    if (adx < 20) {
                        logger.warn(`⚠️ BUY Blocked ${ticker.config.symbol}: Trend too weak (ADX ${adx.toFixed(1)} < 20)`);
                        continue;
                    }

                    // WEEKLY TREND CONFIRMATION
                    const confirmed = await this.hasWeeklyTrend(ticker);
                    if (!confirmed) {
                        logger.warn(`⚠️ BUY Blocked ${ticker.config.symbol}: Weekly trend is NOT bullish`);
                        continue;
                    }

                    const { multiplier: momentumMult, confidenceIncrease } = EquityMomentumFilter.getMomentumMultiplier(ticker);
                    const isUnderPressure = LosingStreakTracker.isUnderPressure(ticker);
                    const baseConfidenceThreshold = isUnderPressure ? 80 : 60;
                    const dynamicThreshold = baseConfidenceThreshold + confidenceIncrease;

                    if ((signal.confidence?.total || 0) < dynamicThreshold) {
                        logger.warn(`⚠️ BUY Blocked ${ticker.config.symbol}: Confidence ${(signal.confidence?.total || 0).toFixed(0)}% < Threshold ${dynamicThreshold.toFixed(0)}% (Sinyal terlalu lemah untuk regime ${regime})`);
                        continue;
                    }
                    if (heat >= 0.08) {
                        logger.warn(`🛑 Heat Protection: ${ticker.config.symbol} rejected (Portofolio sudah terlalu panas/penuh > 8%)`);
                        continue;
                    }

                    const originalBalance = ticker.account.currentBalance;
                    ticker.account.currentBalance *= (capitalFactor * momentumMult);
                    const convictionMult = CompoundingOptimizer.getConvictionMultiplier(signal.confidence?.total || 0, regime, heat);
                    const action = RiskEngine.calculateATRPositionSize(ticker, stockData, price, regime, false);
                    action.lots = Math.floor(action.lots * convictionMult);
                    ticker.account.currentBalance = originalBalance;

                    if (action.canProceed) {
                        const statusTag = canAccelerate ? '🚀 ACCELERATED' : '💎 COMPOUNDING';
                        const msg = `<b>${statusTag} BUY SIGNAL</b>\nStock: ${ticker.config.symbol}\nPrice: ${price}\nLots: ${action.lots}\nConfidence: ${signal.confidence?.total.toFixed(0)}%\nMode: ${regime}`;

                        report.buySignals.push({
                            symbol: ticker.config.symbol,
                            type: 'BUY',
                            price,
                            confidence: signal.confidence?.total,
                            reason: signal.reason,
                            lots: action.lots,
                            breakdown: signal.breakdown
                        });

                        await this.messenger.sendInteractiveAlert(msg, [
                            { text: '✅ CONFIRM BUY', callbackData: `trade_buy_${ticker.config.symbol}_${price}_${action.lots}` },
                            { text: '❌ IGNORE', callbackData: `trade_ignore_${ticker.config.symbol}` }
                        ]);
                    }
                } else if (signal.type === 'SELL' && ticker.state.isHolding) {
                    const isWin = price > ticker.state.entryPrice;
                    LosingStreakTracker.updateStreak(ticker, isWin);

                    if (!ticker.analytics) ticker.analytics = {
                        totalTrades: 0, winRate: 0, recentTrades: [],
                        profitFactor: 0, maxDrawdown: 0, avgWin: 0, avgLoss: 0, expectancy: 0
                    };
                    if (!ticker.analytics.recentTrades) ticker.analytics.recentTrades = [];
                    ticker.analytics.recentTrades.push(isWin);
                    if (ticker.analytics.recentTrades.length > 20) ticker.analytics.recentTrades.shift();

                    ticker.account.currentBalance = (ticker.state.lots * 100 * price) + ticker.account.reservedCash;
                    ticker.account.reservedCash = 0;
                    ticker.state.isHolding = false;
                    ticker.state.pyramidEntries = 0;
                    CompoundingOptimizer.updateProfitLock(ticker);
                    ticker.state.entryPrice = 0;
                    ticker.state.lots = 0;
                    ticker.state.lastExitPrice = price;

                    report.sellSignals.push({
                        symbol: ticker.config.symbol,
                        type: 'SELL',
                        price,
                        reason: signal.reason
                    });

                    if (dbSymbols.has(ticker.config.symbol)) await this.tickerRepo.save(ticker);
                    await this.messenger.sendAlert(`📉 <b>SELL EXECUTED (AUTO)</b>\nStock: ${ticker.config.symbol}\nWin: ${isWin ? '✅' : '❌'}\nReason: ${signal.reason}`);
                }

                // Update Equity Tracking (only for DB tickers)
                if (dbSymbols.has(ticker.config.symbol)) {
                    const currentEquity = ticker.account.currentBalance + (ticker.state.isHolding ? (ticker.state.lots * 100 * price) : 0);
                    RiskEngine.updateEquityPeaks(ticker, currentEquity);
                    if (!ticker.state.equityHistory) ticker.state.equityHistory = [];
                    ticker.state.equityHistory.push({ date: new Date(), equity: currentEquity });
                    if (ticker.state.equityHistory.length > 30) ticker.state.equityHistory.shift();
                    if (ticker.state.isHolding && price > ticker.state.highestPrice) ticker.state.highestPrice = price;
                    await this.tickerRepo.save(ticker);
                }
            }
        } catch (error) {
            logger.error('Scanner Use Case Error:', error);
        }

        return report;
    }

    private async applyRegimeAutoPilot(dbTickers: DomainTicker[], regime: MarketRegime) {
        if (regime === MarketRegime.SIDEWAYS) return; // Don't auto-adjust in sideways markets

        const targetEntryRule: EntryRule = regime === MarketRegime.BULL ? 'AGGRESSIVE' : 'CONSERVATIVE';
        const targetRisk = regime === MarketRegime.BULL ? 0.02 : 0.005;
        const targetTrail = regime === MarketRegime.BULL ? 0.12 : 0.08;

        // Check if any ticker needs an update
        const tickersToUpdate = dbTickers.filter(t =>
            t.config.entryRule !== targetEntryRule ||
            t.config.riskPerTrade !== targetRisk ||
            t.config.trailPercent !== targetTrail
        );

        if (tickersToUpdate.length === 0) return;

        logger.info(`🔄 [Regime-AutoPilot] Shift: ${regime} | Target: ${targetEntryRule} | Risk: ${targetRisk * 100}%`);
        logger.info(`🔄 Updating ${tickersToUpdate.length} tickers in database...`);

        // Update in DB (parallel)
        await Promise.all(tickersToUpdate.map(async (t) => {
            t.config.entryRule = targetEntryRule;
            t.config.riskPerTrade = targetRisk;
            t.config.trailPercent = targetTrail;

            // the repo save uses (ticker, userId)
            // if t.userId is missing (unlikely for dbTickers), we use 'global'
            await this.tickerRepo.save(t, t.userId || 'global');
        }));
    }
}
