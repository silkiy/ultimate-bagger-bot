import { DomainTicker } from '../entities/Ticker';

export enum MarketRegime {
    BULL = 'BULL',
    SIDEWAYS = 'SIDEWAYS',
    BEAR = 'BEAR'
}

export class EquityModeCalculator {
    /**
     * Institutional Drawdown Tiers:
     * 0-5%: Multiplier 1.0
     * 5-10%: Multiplier 0.75
     * 10-15%: Multiplier 0.5
     * >15%: Halt (handled in RiskEngine checkSystemHalt)
     */
    static getRiskMultiplier(ticker: DomainTicker): number {
        const peak = ticker.account.peakEquity || ticker.account.initialCapital;
        const current = ticker.account.currentBalance;
        const drawdownCount = (peak - current) / peak;

        if (drawdownCount < 0.05) return 1.0;
        if (drawdownCount < 0.10) return 0.75;
        if (drawdownCount < 0.15) return 0.5;
        return 0; // Should be halted
    }
}

export class DynamicRiskScaler {
    private static readonly BASE_RISK = 0.02; // 2%
    private static readonly MAX_RISK_CAP = 0.025; // 2.5%
    private static readonly GROWTH_THRESHOLD = 0.10; // 10% above peak

    /**
     * Scaling formula: base_risk * (1 + growth_factor)
     * If equity > peak * 1.10, increase risk slightly.
     */
    static calculateAdvancedRisk(ticker: DomainTicker): number {
        const peak = ticker.account.peakEquity || ticker.account.initialCapital;
        const current = ticker.account.currentBalance;

        if (current > peak * (1 + this.GROWTH_THRESHOLD)) {
            const growthFactor = (current - peak) / peak;
            const scaledRisk = this.BASE_RISK * (1 + growthFactor);
            return Math.min(scaledRisk, this.MAX_RISK_CAP);
        }

        return this.BASE_RISK;
    }
}

export class RegimeCapitalAllocator {
    /**
     * Bull: 100% allocation
     * Sideways: 70% allocation
     * Bear: 30% allocation
     */
    static getAllowedCapitalFactor(regime: MarketRegime): number {
        switch (regime) {
            case MarketRegime.BULL: return 1.0;
            case MarketRegime.SIDEWAYS: return 0.7;
            case MarketRegime.BEAR: return 0.3;
            default: return 0.7;
        }
    }
}

export class LosingStreakTracker {
    private static readonly STREAK_LIMIT = 4;

    /**
     * If losing streak > 4, strategy requirements tighten (handled in Scanner logic)
     */
    static isUnderPressure(ticker: DomainTicker): boolean {
        return ticker.state.consecutiveLosses >= this.STREAK_LIMIT;
    }

    static updateStreak(ticker: DomainTicker, isWin: boolean): void {
        if (isWin) {
            ticker.state.consecutiveLosses = 0;
        } else {
            ticker.state.consecutiveLosses += 1;
        }
    }
}
