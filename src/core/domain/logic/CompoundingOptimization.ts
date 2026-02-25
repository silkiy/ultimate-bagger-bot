import { DomainTicker } from '../entities/Ticker';
import { MarketRegime } from './CapitalPreservation';

export class EquityMomentumFilter {
    private static readonly MOMENTUM_LOOKBACK = 10;
    private static readonly SLOPE_REDUCTION_FACTOR = 0.25;

    /**
     * Calculates the slope of the equity curve over the last 10 snapshots.
     * Returns a reduction factor if the slope is negative.
     */
    static getMomentumMultiplier(ticker: DomainTicker): { multiplier: number, confidenceIncrease: number } {
        const history = ticker.state.equityHistory || [];
        if (history.length < this.MOMENTUM_LOOKBACK) {
            return { multiplier: 1.0, confidenceIncrease: 0 };
        }

        const recentHistory = history.slice(-this.MOMENTUM_LOOKBACK);
        const startEquity = recentHistory[0].equity;
        const endEquity = recentHistory[recentHistory.length - 1].equity;

        // Simplified slope: comparison of start and end
        if (endEquity < startEquity) {
            return {
                multiplier: 1.0 - this.SLOPE_REDUCTION_FACTOR,
                confidenceIncrease: 10
            };
        }

        return { multiplier: 1.0, confidenceIncrease: 0 };
    }
}

export class CompoundingOptimizer {
    private static readonly BASE_RISK = 0.02;     // 2%
    private static readonly MAX_RISK_CAP = 0.025; // 2.5%
    private static readonly MIN_RISK_CAP = 0.015; // 1.5%

    private static readonly DRAWDOWN_RISK_MULTIPLIER = 0.75;
    private static readonly PEAK_THRESHOLDS = [1.10, 1.20]; // 10%, 20% growth

    private static readonly PROFIT_LOCK_INTERVAL = 0.05; // 5% growth increment
    private static readonly PROFIT_LOCK_RATIO = 0.30;    // 30% of profit locked

    private static readonly HIGH_CONVICTION_THRESHOLD = 85;
    private static readonly HIGH_CONVICTION_MULTIPLIER = 1.2;

    /**
     * Adaptive Risk Scaling Logic:
     * - Drawdown > 0% -> reduce risk by multiplier
     * - Growth > 10% -> risk 2.25%
     * - Growth > 20% -> risk 2.5%
     */
    static calculateAdaptiveRisk(ticker: DomainTicker): number {
        const peak = ticker.account.peakEquity || ticker.account.initialCapital;
        const current = ticker.account.currentBalance;

        // 1. Drawdown State
        if (current < peak) {
            return Math.max(this.MIN_RISK_CAP, this.BASE_RISK * this.DRAWDOWN_RISK_MULTIPLIER);
        }

        // 2. Growth State (New Peaks)
        if (current > peak * this.PEAK_THRESHOLDS[1]) {
            return this.MAX_RISK_CAP; // 2.5%
        }
        if (current > peak * this.PEAK_THRESHOLDS[0]) {
            return 0.0225; // 2.25%
        }

        return this.BASE_RISK;
    }

    /**
     * Profit Lock Logic: 
     * Lock 30% of profit every 5% growth increment above peak
     */
    static updateProfitLock(ticker: DomainTicker): void {
        const peak = ticker.account.peakEquity || ticker.account.initialCapital;
        const current = ticker.account.currentBalance;

        if (current > peak * (1 + this.PROFIT_LOCK_INTERVAL)) {
            const floatingProfit = current - peak;
            const lockAmount = floatingProfit * this.PROFIT_LOCK_RATIO;

            ticker.account.lockedCapital += lockAmount;
            ticker.account.currentBalance -= lockAmount; // Move to locked vault
            // Reset peak to current equity after locking to avoid double-locking the same profit
            ticker.account.peakEquity = current - lockAmount;
        }
    }

    /**
     * High Conviction Boost: x1.2 for confidence > 85% in Bull market
     */
    static getConvictionMultiplier(confidence: number, regime: MarketRegime, currentHeat: number): number {
        if (confidence >= this.HIGH_CONVICTION_THRESHOLD &&
            regime === MarketRegime.BULL &&
            currentHeat < 0.04) {
            return this.HIGH_CONVICTION_MULTIPLIER;
        }
        return 1.0;
    }

    /**
     * Capital Efficiency Ranking Score:
     * Score = (Trend Strength * Volume Quality) / ATR Risk
     * (Provides a relative ranking even for non-actionable signals)
     */
    static calculateRankingScore(ticker: DomainTicker, signal: any, atr: number): number {
        const confidence = signal.confidence?.total || 0;
        const risk = atr > 0 ? atr : 1;

        // Boost score for BUY signals, but keep a baseline for others
        const bias = signal.type === 'BUY' ? 2.0 : 1.0;

        return (confidence * bias) / risk;
    }
}
