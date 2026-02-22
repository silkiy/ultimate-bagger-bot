import { DomainTicker } from '../entities/Ticker';
import { TradeLog, SignalHistory, EquitySnapshot } from '../entities/Tracking';

export interface ITickerRepository {
    // All watchlist methods scoped by userId
    findBySymbol(symbol: string, userId?: string): Promise<DomainTicker | null>;
    findAll(userId?: string): Promise<DomainTicker[]>;
    save(ticker: DomainTicker, userId?: string): Promise<void>;
    deleteBySymbol(symbol: string, userId?: string): Promise<void>;

    // Tracking (not user-scoped, global audit trail)
    logTrade(log: TradeLog): Promise<void>;
    logSignal(signal: SignalHistory): Promise<void>;
    saveEquitySnapshot(snapshot: EquitySnapshot): Promise<void>;
    getTradeLogs(symbol?: string): Promise<TradeLog[]>;
}
