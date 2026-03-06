import { DomainTicker } from '../../core/domain/entities/Ticker';
import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { IStrategy, BacktestResult } from '../../core/domain/interfaces/Strategy';
import { logger } from '../../infrastructure/logging/WinstonLogger';
import { PerformanceCalculator, MonteCarloSimulator, PerformanceReport } from '../../core/domain/logic/PerformanceAnalytics';
import { TradeLog } from '../../core/domain/entities/Tracking';

export class ExecuteBacktest {
    constructor(
        private marketData: IMarketDataProvider,
        private strategy: IStrategy
    ) { }

    async execute(ticker: DomainTicker, walkForward: boolean = false): Promise<BacktestResult | PerformanceReport | null> {
        logger.info(`🧪 Running Institutional Backtest for ${ticker.config.symbol}${walkForward ? ' (Walk-Forward)' : ''}`);

        try {
            const startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 2);
            const data = await this.marketData.fetchHistoricalData(ticker.config.symbol, startDate);

            if (data.length < 100) return null;

            let balance = ticker.account.initialCapital;
            let holding = false;
            let lots = 0;
            let reservedCash = 0;
            let trades: TradeLog[] = [];
            let equityCurve: number[] = [];
            let tradeReturns: number[] = [];

            // Institutional Simulation Loop
            for (let i = 100; i < data.length; i++) {
                const subData = data.slice(0, i + 1);
                const signal = this.strategy.calculateSignal(ticker, subData, true);
                const current = data[i];
                const price = current.adjclose || current.close || 0;

                // Update V10 State for simulation
                if (holding) {
                    ticker.state.highestPrice = Math.max(ticker.state.highestPrice || 0, price);
                    if (signal.breakdown?.stopLoss) {
                        ticker.state.trailingStopPrice = Math.max(ticker.state.trailingStopPrice || 0, signal.breakdown.stopLoss);
                    }
                }

                if (!holding && signal.type === 'BUY') {
                    // Backtest simple sizing (1% risk proxy)
                    const cost = balance * 0.99;
                    lots = Math.floor((cost / price) / 100);
                    if (lots > 0) {
                        balance -= (lots * 100 * price);
                        reservedCash = balance;
                        holding = true;
                        ticker.state.isHolding = true;
                        ticker.state.entryPrice = price;
                        ticker.state.highestPrice = price;
                        ticker.state.lots = lots;
                        ticker.state.hasScaledOut = false;
                        ticker.state.trailingStopPrice = signal.breakdown?.stopLoss || 0;
                    }
                } else if (holding && signal.type === 'SELL_PARTIAL' && !ticker.state.hasScaledOut) {
                    const halfLots = Math.floor(lots / 2);
                    if (halfLots > 0) {
                        lots -= halfLots;
                        ticker.state.lots = lots;
                        ticker.state.hasScaledOut = true;
                        balance += (halfLots * 100 * price);
                        
                        trades.push({
                            symbol: ticker.config.symbol,
                            type: 'SELL', // Signal is SELL_PARTIAL, but execution is a SELL
                            executedPrice: price,
                            lots: halfLots,
                            totalValue: (halfLots * 100 * price),
                            timestamp: current.date,
                            reason: 'Partial TP (50%)'
                        } as any);
                    }
                } else if (holding && signal.type === 'SELL') {
                    const proceeds = lots * 100 * price;
                    const tradeReturn = (price - ticker.state.entryPrice) / ticker.state.entryPrice;
                    tradeReturns.push(tradeReturn);

                    balance += proceeds;
                    holding = false;
                    ticker.state.isHolding = false;

                    trades.push({
                        symbol: ticker.config.symbol,
                        type: 'SELL',
                        executedPrice: price,
                        lots: lots,
                        totalValue: proceeds,
                        timestamp: current.date,
                        reason: signal.reason
                    } as any);
                    
                    ticker.state.entryPrice = 0;
                    ticker.state.highestPrice = 0;
                    ticker.state.lots = 0;
                    ticker.state.hasScaledOut = false;
                    ticker.state.trailingStopPrice = 0;
                }

                equityCurve.push(holding ? (lots * 100 * price + balance) : balance);
            }

            const days = (data[data.length - 1].date.getTime() - data[0].date.getTime()) / (1000 * 3600 * 24);
            const report = PerformanceCalculator.calculate(ticker.account.initialCapital, balance, trades, days);

            // Monte Carlo
            const mcResults = MonteCarloSimulator.run(tradeReturns, ticker.account.initialCapital);
            const p95Drawdown = mcResults.p95Drawdown;

            logger.info(`✅ Backtest Complete for ${ticker.config.symbol}. CAGR: ${(report.cagr * 100).toFixed(2)}%, P95 Drawdown: ${p95Drawdown.toFixed(2)}%`);

            return {
                ...report,
                p95Drawdown: p95Drawdown,
                equityCurve
            } as any;
        } catch (error) {
            logger.error(`Backtest failed for ${ticker.config.symbol}:`, error);
            return null;
        }
    }
}
