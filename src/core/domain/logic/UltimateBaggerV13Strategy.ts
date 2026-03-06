import { DomainTicker } from '../entities/Ticker';
import { OHLCV, Signal } from '../entities/MarketData';
import { IStrategy } from '../interfaces/Strategy';
import { DomainMath } from '../logic/Math';

export class UltimateBaggerV13Strategy implements IStrategy {
    calculateSignal(ticker: DomainTicker, data: OHLCV[], isMarketBullish: boolean): Signal {
        const { config, state } = ticker;
        const current = data[data.length - 1];
        const prev = data[data.length - 2];

        if (!current || !prev) {
            return this.createHoldSignal(ticker, 'Insufficient data');
        }

        const price = current.adjclose || current.close;
        const prevPrice = prev.adjclose || prev.close;

        // --- Core Indicators ---
        const tenkan = DomainMath.getDonchian(data.slice(-config.tenkanPeriod));
        const kijun = DomainMath.getDonchian(data.slice(-config.kijunPeriod));
        const volMA = DomainMath.getVolumeSMA(data, 20);
        const atr = DomainMath.getATR(data, config.atrLength || 14);
        const intensity = DomainMath.getSmartMoneyIntensity(data, 20);
        const patterns = DomainMath.detectPatterns(data);

        // --- Institutional Price Action (V13.2 Elite Hybrid) ---
        const swingHigh = Math.max(...data.slice(-60).map(d => d.high));
        const swingLow = Math.min(...data.slice(-60).map(d => d.low));
        const fib = DomainMath.calculateFibLevels(swingHigh, swingLow);
        const pivot = DomainMath.calculatePivotPoints(prev.high, prev.low, prev.close);

        // Ichimoku Cloud
        const pastData = data.slice(0, -config.displacement);
        const pastTenkan = DomainMath.getDonchian(pastData.slice(-config.tenkanPeriod));
        const pastKijun = DomainMath.getDonchian(pastData.slice(-config.kijunPeriod));
        const spanA = (pastTenkan + pastKijun) / 2;
        const spanB = DomainMath.getDonchian(pastData.slice(-config.spanBPeriod));
        const cloudUpper = Math.max(spanA, spanB);
        const isAboveCloud = price > cloudUpper;

        const prevTenkan = DomainMath.getDonchian(data.slice(-config.tenkanPeriod - 1, -1));
        const prevKijun = DomainMath.getDonchian(data.slice(-config.kijunPeriod - 1, -1));

        // --- V13.2 Elite Hybrid Logic ---
        // 1. Precise Golden Pocket (0.5 - 0.618)
        const isGoldenPocket = price <= fib['0.5'] * 1.01 && price >= fib['0.618'] * 0.99;
        // 2. Strong Pivot Support (Near S1/S2)
        const isStrongSupport = price <= pivot.S1 * 1.01 && price >= pivot.S2 * 0.99;
        // 3. Institutional Signature (Vol Spike & Accumulation)
        const isVolumeSpike = current.volume > prev.volume && current.volume > volMA;
        const isSmartMoneyBuying = intensity > 10;
        // 4. Candlestick Confirmation
        const isBullishReversal = patterns.includes('HAMMER') || patterns.includes('BULLISH-ENGULFING') || patterns.includes('BULLISH-MARUBOZU');

        const condIHSG = config.useIHSG ? isMarketBullish : true;

        if (!state.isHolding) {
            const tkCross = prevTenkan <= prevKijun && tenkan > kijun;
            const priceXTenkan = prevPrice <= prevTenkan && price > tenkan;
            
            let trigger = false;
            let entryReason = '';

            // Strategy A: Confluence of Fib + Reversal + Institutional Volume
            if (isGoldenPocket && isBullishReversal && isVolumeSpike) {
                trigger = true;
                entryReason = 'Fib Golden Pocket Hybrid';
            } 
            // Strategy B: Confluence of Pivot + Reversal + Institutional Volume
            else if (isStrongSupport && isBullishReversal && isVolumeSpike) {
                trigger = true;
                entryReason = 'Pivot Support Hybrid';
            }
            // Strategy C: High Conviction TK Cross above Cloud with Smart Money
            else if (tkCross && isAboveCloud && isSmartMoneyBuying) {
                trigger = true;
                entryReason = 'Ichimoku Sovereign Cross';
            }

            if (trigger && condIHSG) {
                // Risk-Reward Audit (Targets)
                const targetTP = Math.max(fib['extension1.618'], pivot.R2);
                const stopLoss = Math.min(price - (atr * 3.0), pivot.S2, fib['0.786']); // 3.0x ATR floor for safety
                const risk = price - stopLoss;
                const reward = targetTP - price;
                const rrr = reward / (risk || 1);

                // STRICT RRR 1:2 Audit
                if (rrr < 1.8) { // 1.8 tolerance for rounding
                    return this.createHoldSignal(ticker, `Filtered: RRR ${rrr.toFixed(1)} < 1.8`);
                }

                return {
                    symbol: ticker.config.symbol,
                    type: 'BUY',
                    price,
                    reason: `V13.2 Elite: ${entryReason} (RRR 1:${rrr.toFixed(1)})`,
                    timestamp: new Date(),
                    confidence: { trend: 85, volume: 90, total: 88 },
                    breakdown: {
                        isAboveCloud,
                        isCrossed: true,
                        isVolumeBreakout: true,
                        kijunLevel: kijun,
                        tenkanLevel: tenkan,
                        stopLoss: stopLoss
                    }
                };
            }
        } else {
            // --- V13.2 Adaptive Institutional Exit ---
            const targetTP = Math.max(fib['extension1.618'], pivot.R2);
            const profitPct = (price - state.entryPrice) / state.entryPrice;
            
            // Tighten Stop Loss as price moves in our favor
            let adaptiveMult = 3.0; 
            if (profitPct > 0.10) adaptiveMult = 1.2;      // Tighten aggressively at +10%
            else if (profitPct > 0.05) adaptiveMult = 2.0; // Tighten at +5%

            const dynamicStop = state.highestPrice - (atr * adaptiveMult);
            // Don't let trailing stop drop below previous highs (Profit Locking)
            const currentTrailingStop = Math.max(state.trailingStopPrice || 0, dynamicStop, pivot.S1);

            // 1. Take Profit at Resistance
            if (price >= targetTP) {
                return {
                    symbol: ticker.config.symbol,
                    type: 'SELL',
                    price,
                    reason: 'V13.2 Elite TP: Hit Target Resistance',
                    timestamp: new Date(),
                    breakdown: { isAboveCloud, isCrossed: false, isVolumeBreakout: false, kijunLevel: kijun, tenkanLevel: tenkan, stopLoss: currentTrailingStop }
                };
            }

            // 2. Trailing Stop / SL
            if (price < currentTrailingStop) {
                const isProfit = price > state.entryPrice;
                return {
                    symbol: ticker.config.symbol,
                    type: 'SELL',
                    price,
                    reason: isProfit ? 'V13.2 Profit Locked' : 'V13.2 Protection Hit',
                    timestamp: new Date(),
                    breakdown: { isAboveCloud, isCrossed: false, isVolumeBreakout: false, kijunLevel: kijun, tenkanLevel: tenkan, stopLoss: currentTrailingStop }
                };
            }
        }

        return this.createHoldSignal(ticker, 'Analyzing Market Structure', price, data);
    }

    private createHoldSignal(ticker: DomainTicker, reason: string, price: number = 0, data: OHLCV[] = []): Signal {
        return {
            symbol: ticker.config.symbol,
            type: 'HOLD',
            price: price,
            reason: reason,
            timestamp: new Date()
        };
    }
}
