import { OHLCV } from '../entities/MarketData';

export interface RealTimeQuote {
    price: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    previousClose: number;
    changePercent: number;
    marketCap: number;
    name: string;
}

export interface FinancialData {
    symbol: string;
    pe?: number;
    pb?: number;
    eps?: number;
    marketCap?: number;
    sector?: string;
    industry?: string;
}

export interface IMarketDataProvider {
    fetchHistoricalData(symbol: string, startDate: Date, interval?: '1d' | '1wk' | '1mo'): Promise<OHLCV[]>;
    fetchRealTimeQuote?(symbol: string): Promise<RealTimeQuote | null>;
    fetchFinancials?(symbol: string): Promise<FinancialData | null>;
    validateSymbol?(symbol: string): Promise<boolean>;
    searchSymbol?(query: string): Promise<Array<{ symbol: string; name: string; exchange: string }>>;
    fetchTopActiveSymbols?(region: string): Promise<string[]>;
    fetchTopGainers?(region: string): Promise<string[]>;
}

export interface IMessagingService {
    sendAlert(message: string): Promise<void>;
    sendInteractiveAlert(message: string, buttons: { text: string, callbackData: string }[]): Promise<void>;
    broadcast(message: string): Promise<void>;
}
