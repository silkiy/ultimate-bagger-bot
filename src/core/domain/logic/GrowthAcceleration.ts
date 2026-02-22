import { DomainTicker } from '../entities/Ticker';
import { MarketRegime } from './CapitalPreservation';

export class AccelerationGuard {
    private static readonly MIN_POSITIVE_DAYS = 15;
    private static readonly MAX_DRAWDOWN_ALLOWED = 0.05; // 5%
    private static readonly MIN_WINRATE_REQUIRED = 0.60;  // 60%

    /**
     * activation_requirements check
     */
    static canAccelerate(ticker: DomainTicker, regime: MarketRegime, heat: number): boolean {
        const peak = ticker.account.peakEquity || ticker.account.initialCapital;
        const current = ticker.account.currentBalance;
        const drawdown = (peak - current) / peak;

        // 1. Drawdown Guard
        if (drawdown > this.MAX_DRAWDOWN_ALLOWED) return false;

        // 2. Regime Guard
        if (regime !== MarketRegime.BULL) return false;

        // 3. Heat Guard
        if (heat > 0.06) return false;

        // 4. Winrate Guard (Rolling)
        const recent = ticker.analytics.recentTrades || [];
        if (recent.length >= 10) {
            const wins = recent.filter(w => w).length;
            const winrate = wins / recent.length;
            if (winrate < this.MIN_WINRATE_REQUIRED) return false;
        }

        // 5. Equity Slope Guard (15 days positive)
        const history = ticker.state.equityHistory || [];
        if (history.length >= this.MIN_POSITIVE_DAYS) {
            const start = history[history.length - this.MIN_POSITIVE_DAYS].equity;
            const end = history[history.length - 1].equity;
            if (end <= start) return false;
        }

        return true;
    }
}

export class AccelerationCalculator {
    /**
     * Tier 1: Growth >= 8% -> 1.1x mult, 2.5% max risk
     * Tier 2: Growth >= 15% -> 1.2x mult, 3.0% max risk
     */
    static getTierMultiplier(ticker: DomainTicker): { multiplier: number, maxRiskCap: number } {
        const history = ticker.state.equityHistory || [];
        if (history.length < 30) return { multiplier: 1.0, maxRiskCap: 0.025 };

        const startEquity = history[0].equity;
        const currentEquity = history[history.length - 1].equity;
        const growth = (currentEquity - startEquity) / startEquity;

        if (growth >= 0.15) {
            return { multiplier: 1.2, maxRiskCap: 0.03 };
        }
        if (growth >= 0.08) {
            return { multiplier: 1.1, maxRiskCap: 0.025 };
        }

        return { multiplier: 1.0, maxRiskCap: 0.025 };
    }
}

export class PyramidingLogic {
    private static readonly MAX_ADDITIONAL_ENTRIES = 1;
    private static readonly ADD_POSITION_SIZE_FACTOR = 0.5;

    /**
     * Conditions: profit >= 1R, trend > 80, volume > 1.3
     */
    static canPyramid(ticker: DomainTicker, signal: any, currentPrice: number): boolean {
        if (!ticker.state.isHolding) return false;
        if ((ticker.state.pyramidEntries || 0) >= this.MAX_ADDITIONAL_ENTRIES) return false;

        // Profit Check (1R)
        // R is the initial risk distance: (entry - stop)
        // Simplified stop distance using atrMultiplier at entry
        const entryPrice = ticker.state.entryPrice;
        const currentProfit = currentPrice - entryPrice;

        // We use a simplified R check: current profit > 5% as proxy for 1R if ATR not stored
        // Better: Compare to (EntryPrice - trailingStopAtEntry)
        const isOneR = currentProfit / entryPrice > 0.05;

        const trendStrength = signal.metadata?.trendStrength || 0;
        const volumeQuality = signal.metadata?.volumeQuality || 0;

        return isOneR && trendStrength > 80 && volumeQuality > 1.3;
    }

    static getScalingFactor(): number {
        return this.ADD_POSITION_SIZE_FACTOR;
    }
}

export class VolatilityGuard {
    private static readonly EXPANSION_THRESHOLD = 1.5;

    /**
     * Disable Acceleration if current ATR > 1.5x of moving average ATR
     */
    static isVolatile(currentAtr: number, history: number[]): boolean {
        if (!history || history.length < 14) return false;
        const avgAtr = history.reduce((a, b) => a + b, 0) / history.length;
        return currentAtr > avgAtr * this.EXPANSION_THRESHOLD;
    }
}
