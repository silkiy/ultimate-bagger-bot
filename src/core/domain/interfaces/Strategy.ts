import { DomainTicker } from '../entities/Ticker';
import { OHLCV, Signal } from '../entities/MarketData';

export interface IStrategy {
    calculateSignal(ticker: DomainTicker, data: OHLCV[], isMarketBullish: boolean): Signal;
}

export interface IBacktester {
    run(ticker: DomainTicker, data: OHLCV[]): BacktestResult;
}

export interface BacktestResult {
    symbol: string;
    totalReturn: number;
    winRate: number;
    profitFactor: number;
    totalTrades: number;
    equityCurve: number[];
}
