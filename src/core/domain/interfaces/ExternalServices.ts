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

export interface IMarketDataProvider {
    fetchHistoricalData(symbol: string, startDate: Date): Promise<OHLCV[]>;
    fetchRealTimeQuote?(symbol: string): Promise<RealTimeQuote | null>;
    validateSymbol?(symbol: string): Promise<boolean>;
    searchSymbol?(query: string): Promise<Array<{ symbol: string; name: string; exchange: string }>>;
    fetchTopActiveSymbols?(region: string): Promise<string[]>;
}

export interface IMessagingService {
    sendAlert(message: string): Promise<void>;
    sendInteractiveAlert(message: string, buttons: { text: string, callbackData: string }[]): Promise<void>;
    broadcast(message: string): Promise<void>;
}
