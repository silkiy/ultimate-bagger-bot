export interface OHLCV {
    date: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    adjclose?: number;
}

export interface Signal {
    symbol: string;
    type: 'BUY' | 'SELL' | 'HOLD';
    price: number;
    reason: string;
    timestamp: Date;
    confidence?: {
        trend: number;    // 0-100
        volume: number;   // 0-100
        total: number;    // 0-100
    };
    breakdown?: {
        isAboveCloud: boolean;
        isCrossed: boolean;
        isVolumeBreakout: boolean;
        kijunLevel: number;
        tenkanLevel: number;
        stopLoss: number;
    };
}
