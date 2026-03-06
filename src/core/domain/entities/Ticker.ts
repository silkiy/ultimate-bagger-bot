export type SizingMode = 'ALL_IN' | 'RISK_BASED';
export type EntryRule = 'AGGRESSIVE' | 'STANDARD' | 'PULLBACK' | 'CONSERVATIVE';

export interface TickerConfig {
    symbol: string;
    tenkanPeriod: number;
    kijunPeriod: number;
    spanBPeriod: number;
    displacement: number;
    trailPercent: number;
    entryRule: EntryRule;
    sizingMode: SizingMode;
    riskPerTrade: number;
    useVolEntry: boolean;
    useVolExit: boolean;
    useExitKijun: boolean;
    useTrailing: boolean;
    volEntryMult: number;
    volDistMult: number;
    atrMultiplier: number; // For ATR-based sizing (e.g., 2.0)
    // V10 Specific
    volMemory: number;       // Days to look back for volume spike
    useIHSG: boolean;        // Macro filter
    useMTF: boolean;         // Weekly cloud filter
    usePartialTP: boolean;   // Scaling out logic
    tpTargetPct: number;     // Target for 50% TP
    atrLength: number;       // Period for ATR
    atrTrailMult: number;    // Multiplier for ATR trailing stop
}

export interface TickerAccount {
    initialCapital: number;
    currentBalance: number;
    reservedCash: number;
    isCompounding: boolean;
    peakEquity: number;    // All-time peak for drawdown track
    dailyPeakEquity: number; // Daily peak for daily loss track
    dailyStartEquity: number; // Equity at start of day
    lockedCapital: number;    // Capital excluded from risk sizing
}

export interface DomainTicker {
    userId?: string; // Optional for in-memory or dynamic tickers
    config: TickerConfig;
    account: TickerAccount;
    state: {
        isHolding: boolean;
        entryPrice: number;
        highestPrice: number;
        lots: number;
        lastExitPrice: number;
        consecutiveLosses: number; // For frequency control
        equityHistory: { date: Date, equity: number }[]; // For momentum calculation
        pyramidEntries: number; // Scale-in count
        atrHistory: number[];   // For volatility expansion check
        // V10 Specific State
        hasScaledOut: boolean;
        trailingStopPrice: number;
    };
    analytics: {
        totalTrades: number;
        winRate: number;
        recentTrades: boolean[]; // Last 10-20 trades for rolling winrate
        profitFactor: number;
        maxDrawdown: number;
        avgWin: number;
        avgLoss: number;
        expectancy: number;
    };
    risk: {
        maxExposure: number;
        currentHeat: number;
    };
}
