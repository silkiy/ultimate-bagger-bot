import { DomainTicker } from '../entities/Ticker';
import { OHLCV } from '../entities/MarketData';
import { DomainMath } from './Math';
import { EquityModeCalculator, MarketRegime } from './CapitalPreservation';
import { CompoundingOptimizer } from './CompoundingOptimization';
import { AccelerationGuard, AccelerationCalculator } from './GrowthAcceleration';

export interface PositionAction {
    lots: number;
    reservedCash: number;
    canProceed: boolean;
    reason?: string;
}

export class RiskEngine {
    // Institutional Constants
    private static readonly PORTFOLIO_HEAT_LIMIT = 0.08; // 8% max total portfolio risk
    private static readonly DAILY_LOSS_LIMIT = 0.03; // 3% max daily loss
    private static readonly SYSTEM_MAX_DRAWDOWN = 0.15; // 15% max drawdown halt
    private static readonly FEE_BUFFER = 0.01; // 1% fee buffer

    /**
     * Institutional Position Sizing: ATR-based + Growth Acceleration (V7.1)
     */
    static calculateATRPositionSize(
        ticker: DomainTicker,
        data: OHLCV[],
        marketPrice: number,
        regime: MarketRegime = MarketRegime.SIDEWAYS,
        isPyramid: boolean = false
    ): PositionAction {
        const { account, config } = ticker;

        // 1. System Halt Checks
        const systemCheck = this.checkSystemHalt(ticker);
        if (!systemCheck.canProceed) {
            return { lots: 0, reservedCash: 0, canProceed: false, reason: systemCheck.reason };
        }

        // 2. Usable Capital
        const availableBalance = account.currentBalance - (account.lockedCapital || 0);
        const usableCapital = availableBalance * (1 - this.FEE_BUFFER);

        // 3. Adaptive Risk Scaling (Compounding Engines Baseline)
        let baseRisk = CompoundingOptimizer.calculateAdaptiveRisk(ticker);
        let maxRiskCap = 0.025; // 2.5% Default

        // 4. Growth Acceleration (V7.1)
        const currentHeat = 0.04; // Simplified heat for calculation
        if (AccelerationGuard.canAccelerate(ticker, regime, currentHeat)) {
            const { multiplier, maxRiskCap: acceleratedCap } = AccelerationCalculator.getTierMultiplier(ticker);
            baseRisk *= multiplier;
            maxRiskCap = acceleratedCap;
        }

        const cappedRisk = Math.min(baseRisk, maxRiskCap);

        // 5. Equity Mode Multiplier (Drawdown Tiers)
        const drawdownMultiplier = EquityModeCalculator.getRiskMultiplier(ticker);

        let effectiveRiskAmount = availableBalance * cappedRisk * drawdownMultiplier;

        // 6. Pyramiding Scale Factor (V7.1)
        if (isPyramid) {
            effectiveRiskAmount *= 0.5; // Pyramiding size factor
        }

        if (effectiveRiskAmount <= 0) {
            return { lots: 0, reservedCash: 0, canProceed: false, reason: 'Risk amount zero (Preservation Mode Active)' };
        }

        // 7. ATR Calculation
        const atr = DomainMath.getATR(data, 14);
        const stopDistance = atr * (config.atrMultiplier || 2.0);

        if (stopDistance <= 0) {
            return { lots: 0, reservedCash: 0, canProceed: false, reason: 'ATR calculation failed' };
        }

        // 8. Units Calculation
        const shares = effectiveRiskAmount / stopDistance;
        let lots = Math.floor(shares / 100);

        // 9. Capital Constraint
        const maxLotsByCapital = Math.floor(usableCapital / (marketPrice * 100));
        lots = Math.min(lots, maxLotsByCapital);

        if (lots <= 0) {
            return { lots: 0, reservedCash: 0, canProceed: false, reason: 'Capital or risk/ATR limit' };
        }

        const cost = lots * 100 * marketPrice;
        const reservedCash = account.currentBalance - cost;

        return {
            lots,
            reservedCash,
            canProceed: true
        };
    }

    /**
     * Check for Portfolio Heat, Daily Loss, and System Drawdown
     */
    static checkSystemHalt(ticker: DomainTicker): { canProceed: boolean, reason?: string } {
        const { account, analytics } = ticker;

        // Total Equity Calculation
        const currentEquity = account.currentBalance; // Simplified: usually includes position value in higher scopes

        // 1. System Max Drawdown (15%)
        const peak = account.peakEquity || account.initialCapital;
        const currentDrawdown = (peak - currentEquity) / peak;
        if (currentDrawdown >= this.SYSTEM_MAX_DRAWDOWN) {
            return { canProceed: false, reason: `System Halt: Max Drawdown Breached (${(currentDrawdown * 100).toFixed(2)}%)` };
        }

        // 2. Daily Loss (3%)
        const dailyStart = account.dailyStartEquity || account.initialCapital;
        const dailyLoss = (dailyStart - currentEquity) / dailyStart;
        if (dailyLoss >= this.DAILY_LOSS_LIMIT) {
            return { canProceed: false, reason: `System Halt: Daily Loss Limit Breached (${(dailyLoss * 100).toFixed(2)}%)` };
        }

        return { canProceed: true };
    }

    /**
     * Portfolio Heat Calculation: Total Risk Exposure across ALL Open Positions
     */
    static calculatePortfolioHeat(tickers: DomainTicker[]): number {
        let totalRiskValue = 0;
        let totalEquity = 0;

        for (const t of tickers) {
            totalEquity += t.account.currentBalance; // In complex systems, this would be global equity
            if (t.state.isHolding) {
                // Risk is the distance to stop loss (estimated via last ATR or fixed)
                // For simplified Heat, we use (Lots * 100 * (EntryPrice - trailingStop))
                const stopLoss = t.state.highestPrice * (1 - t.config.trailPercent);
                const risk = (t.state.entryPrice - stopLoss) * t.state.lots * 100;
                totalRiskValue += Math.max(0, risk);
            }
        }

        return totalEquity > 0 ? totalRiskValue / totalEquity : 0;
    }

    /**
     * Rolling Drawdown Peak Update
     */
    static updateEquityPeaks(ticker: DomainTicker, currentEquity: number): void {
        if (currentEquity > ticker.account.peakEquity) {
            ticker.account.peakEquity = currentEquity;
        }
        if (currentEquity > ticker.account.dailyPeakEquity) {
            ticker.account.dailyPeakEquity = currentEquity;
        }
    }
}
