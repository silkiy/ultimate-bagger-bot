import { DomainTicker } from '../entities/Ticker';
import { OHLCV, Signal } from '../entities/MarketData';
import { IStrategy } from '../interfaces/Strategy';
import { DomainMath } from '../logic/Math';

export class UltimateBaggerV10Strategy implements IStrategy {
    calculateSignal(ticker: DomainTicker, data: OHLCV[], isMarketBullish: boolean): Signal {
        const { config, state } = ticker;
        const current = data[data.length - 1];
        const prev = data[data.length - 2];

        if (!current || !prev) {
            return this.createHoldSignal(ticker, 'Insufficient data');
        }

        const price = current.adjclose || current.close;
        const prevPrice = prev.adjclose || prev.close;

        // --- Indicators ---
        const tenkan = DomainMath.getDonchian(data.slice(-config.tenkanPeriod));
        const kijun = DomainMath.getDonchian(data.slice(-config.kijunPeriod));
        const volMA = DomainMath.getVolumeSMA(data, 20);
        const atr = DomainMath.getATR(data, config.atrLength || 14);

        // Ichimoku Cloud Logic
        const pastData = data.slice(0, -config.displacement);
        const pastTenkan = DomainMath.getDonchian(pastData.slice(-config.tenkanPeriod));
        const pastKijun = DomainMath.getDonchian(pastData.slice(-config.kijunPeriod));
        const spanA = (pastTenkan + pastKijun) / 2;
        const spanB = DomainMath.getDonchian(pastData.slice(-config.spanBPeriod));
        const cloudUpper = Math.max(spanA, spanB);

        const prevTenkan = DomainMath.getDonchian(data.slice(-config.tenkanPeriod - 1, -1));
        const prevKijun = DomainMath.getDonchian(data.slice(-config.kijunPeriod - 1, -1));

        const isAboveCloud = price > cloudUpper;

        // --- V10 Volume Memory Logic ---
        const isVolSpike = (bar: OHLCV, sma: number) => (bar.volume > (sma * config.volEntryMult) && bar.close > bar.open);
        
        let hasVolMemory = false;
        const memoryLength = config.volMemory || 3;
        // Check current and past bars within memory range
        for (let i = 0; i <= memoryLength; i++) {
            const barIndex = data.length - 1 - i;
            if (barIndex < 20) break;
            
            const bar = data[barIndex];
            const historicalSlice = data.slice(0, barIndex + 1);
            const historicalVolMA = DomainMath.getVolumeSMA(historicalSlice, 20);
            
            if (isVolSpike(bar, historicalVolMA)) {
                hasVolMemory = true;
                break;
            }
        }
        const condVolEntry = config.useVolEntry ? hasVolMemory : true;

        // --- V10 Macro Filter ---
        const condIHSG = config.useIHSG ? isMarketBullish : true;
        // Note: useMTF (Weekly Cloud) is handled as a post-filter in RunScanner for now.

        if (!state.isHolding) {
            // --- Entry Rules ---
            let trigger = false;
            let crossType = '';
            if (config.entryRule === 'STANDARD') {
                trigger = prevTenkan <= prevKijun && tenkan > kijun;
                crossType = 'TK Cross';
            } else if (config.entryRule === 'AGGRESSIVE') {
                trigger = prevPrice <= prevTenkan && price > tenkan;
                crossType = 'Price x Tenkan';
            } else if (config.entryRule === 'PULLBACK') {
                trigger = prevPrice <= prevKijun && price > kijun;
                crossType = 'Price Pullback Kijun';
            }

            // Diagnostics for V10 UI
            let diagMsg = 'HUNTING';
            if (trigger) {
                if (!isAboveCloud) diagMsg = 'Tertahan: Bawah Awan';
                else if (!condVolEntry) diagMsg = 'Tertahan: Kurang Volume';
                else if (!condIHSG) diagMsg = 'Tertahan: IHSG Bearish';
                else diagMsg = 'CLEAR (Siap Eksekusi)';
            }

            if (trigger && isAboveCloud && condVolEntry && condIHSG) {
                const adx = DomainMath.getADX(data, 14);
                const intensity = DomainMath.getSmartMoneyIntensity(data, 20);

                // Confidence Scoring (V7 refinement kept for depth)
                const trendStrength = Math.min(100, ((price - cloudUpper) / cloudUpper) * 1000);
                const volRatio = current.volume / (volMA || 1);
                const volStrength = Math.min(100, (volRatio / config.volEntryMult) * 50);
                const totalConfidence = (trendStrength * 0.4) + (volStrength * 0.3) + (adx * 0.3);

                return {
                    symbol: ticker.config.symbol,
                    type: 'BUY',
                    price,
                    reason: `V10 Ichimoku ${crossType} Entry`,
                    timestamp: new Date(),
                    confidence: { trend: trendStrength, volume: volStrength, total: totalConfidence },
                    breakdown: {
                        isAboveCloud,
                        isCrossed: trigger,
                        isVolumeBreakout: condVolEntry,
                        kijunLevel: kijun,
                        tenkanLevel: tenkan,
                        stopLoss: price - (atr * (config.atrTrailMult || 2.5))
                    }
                };
            }
        } else {
            // --- V10 Exit Rules ---
            
            // 1. ATR Trailing Stop Update
            const dynamicStop = state.highestPrice - (atr * (config.atrTrailMult || 2.5));
            // In Pine Script: trailing_stop_price := math.max(trailing_stop_price, dynamic_stop)
            // We'll return the suggested stop in breakdown, RunScanner will update the state.
            const currentTrailingStop = Math.max(state.trailingStopPrice || 0, dynamicStop);

            // 2. Partial Take Profit
            if (config.usePartialTP && !state.hasScaledOut) {
                if (price >= state.entryPrice * (1 + (config.tpTargetPct || 0.10))) {
                    return {
                        symbol: ticker.config.symbol,
                        type: 'SELL_PARTIAL',
                        price,
                        reason: 'V10 Partial TP (50%)',
                        timestamp: new Date(),
                        breakdown: {
                            isAboveCloud,
                            isCrossed: false,
                            isVolumeBreakout: false,
                            kijunLevel: kijun,
                            tenkanLevel: tenkan,
                            stopLoss: currentTrailingStop
                        }
                    };
                }
            }

            // 3. Hard Exit Conditions
            const condKijun = config.useExitKijun && (prevPrice >= prevKijun && price < kijun);
            const condTrail = config.useTrailing && (price < currentTrailingStop);
            const condVol = config.useVolExit && (price < current.open && current.volume > volMA * config.volDistMult);

            if (condKijun || condTrail || condVol) {
                const reason = condKijun ? 'Tembus Kijun' : condTrail ? 'ATR Trailing Hit' : 'Bandar Distribusi';
                return {
                    symbol: ticker.config.symbol,
                    type: 'SELL',
                    price,
                    reason,
                    timestamp: new Date(),
                    breakdown: {
                        isAboveCloud,
                        isCrossed: condKijun,
                        isVolumeBreakout: condVol,
                        kijunLevel: kijun,
                        tenkanLevel: tenkan,
                        stopLoss: currentTrailingStop
                    }
                };
            }
        }

        return this.createHoldSignal(ticker, 'No actionable signal', price, data);
    }

    private createHoldSignal(ticker: DomainTicker, reason: string, price: number = 0, data: OHLCV[] = []): Signal {
        const adx = data.length >= 14 ? DomainMath.getADX(data, 14) : 0;
        const latest = data.length > 0 ? data[data.length - 1] : null;
        const volMA = data.length >= 20 ? DomainMath.getVolumeSMA(data, 20) : 1;
        const volRatio = latest ? (latest.volume / (volMA || 1)) : 1;

        return {
            symbol: ticker.config.symbol,
            type: 'HOLD',
            price: price,
            reason: reason,
            timestamp: new Date(),
            confidence: {
                trend: adx,
                volume: Math.min(100, volRatio * 50),
                total: (adx * 0.5) + (Math.min(100, volRatio * 50) * 0.5)
            }
        };
    }
}
