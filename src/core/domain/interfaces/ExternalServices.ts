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
    // Deep Fundamentals for v15.2
    bookValue?: number;
    sharesOutstanding?: number;
    dividendYield?: number;
    totalCash?: number;
    totalDebt?: number;
    revenue?: number;
    ebit?: number;
    workingCapital?: number;
    retainedEarnings?: number;
    netIncome?: number;
    operatingCashFlow?: number;
    totalAssets?: number;
    totalLiabilities?: number;
}

export interface NewsItem {
    title: string;
    publisher: string;
    link: string;
    publishedAt?: Date;
}

export interface IMarketDataProvider {
    fetchHistoricalData(symbol: string, startDate: Date, interval?: '1d' | '1wk' | '1mo'): Promise<OHLCV[]>;
    fetchRealTimeQuote?(symbol: string): Promise<RealTimeQuote | null>;
    fetchFinancials?(symbol: string): Promise<FinancialData | null>;
    validateSymbol?(symbol: string): Promise<boolean>;
    searchSymbol?(query: string): Promise<Array<{ symbol: string; name: string; exchange: string }>>;
    fetchTopActiveSymbols?(region: string): Promise<string[]>;
    fetchTopGainers?(region: string): Promise<string[]>;
    fetchDeepFundamentals?(symbol: string): Promise<Partial<FinancialData> | null>;
    fetchNewsHeadlines?(symbol: string): Promise<NewsItem[]>;
}

export interface IMessagingService {
    sendAlert(message: string): Promise<void>;
    sendInteractiveAlert(message: string, buttons: { text: string, callbackData: string }[]): Promise<void>;
    broadcast(message: string): Promise<void>;
}
