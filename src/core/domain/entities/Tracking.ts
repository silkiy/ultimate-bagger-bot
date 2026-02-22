export interface TradeLog {
    symbol: string;
    type: 'BUY' | 'SELL';
    price: number;
    executedPrice: number;
    lots: number;
    totalValue: number;
    slippage: number;
    reason: string;
    timestamp: Date;
    rMultiple?: number;
}

export interface SignalHistory {
    symbol: string;
    type: 'BUY' | 'SELL' | 'HOLD';
    price: number;
    confidence: number;
    timestamp: Date;
    metadata: any;
}

export interface EquitySnapshot {
    date: Date;
    totalEquity: number;
    cash: number;
    portfolioValue: number;
    drawdown: number;
}
