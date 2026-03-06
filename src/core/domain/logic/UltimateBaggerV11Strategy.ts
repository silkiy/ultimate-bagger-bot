import { DomainTicker } from '../entities/Ticker';
import { OHLCV, Signal } from '../entities/MarketData';
import { IStrategy } from '../interfaces/Strategy';
import { DomainMath } from '../logic/Math';

export class UltimateBaggerV11Strategy implements IStrategy {
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

        // --- OP Institutional Indicators (V11) ---
        // VWAP (20 days to capture recent institutional average price)
        const vwap = DomainMath.getVWAP(data, 20);
        // POC (Point of Control) over the last 50 days (Major Accumulation Zone)
        const poc = DomainMath.getVolumePointOfControl(data, 50, 20);
        // Volatility Contraction (VCP)
        const isVCP = DomainMath.detectVCP(data);

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

        // --- V11 Institutional Whale Filters ---
        // Price MUST be above recent VWAP (Institutions are in profit, not trapped)
        const isAboveVWAP = price >= vwap;
        // Price MUST be above the Point of Control (Breaking out of accumulation zone)
        const isAbovePOC = price >= poc * 0.98; // 2% tolerance zone

        // --- V10 Macro Filter ---
        const condIHSG = config.useIHSG ? isMarketBullish : true;

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

            // Diagnostics for V11 UI
            let diagMsg = 'HUNTING';
            if (trigger) {
                if (!isAboveCloud) diagMsg = 'Tertahan: Bawah Awan';
                else if (!condVolEntry) diagMsg = 'Tertahan: Kurang Volume';
                else if (!condIHSG) diagMsg = 'Tertahan: IHSG Bearish';
                else if (!isAboveVWAP) diagMsg = 'Tertahan: Bawah VWAP (Bandar Sangkut)';
                else if (!isAbovePOC) diagMsg = 'Tertahan: Bawah Area Akumulasi (POC)';
                else diagMsg = 'CLEAR (Siap Eksekusi)';
            }

            if (trigger && isAboveCloud && condVolEntry && condIHSG && isAboveVWAP && isAbovePOC) {
                const adx = DomainMath.getADX(data, 14);
                const intensity = DomainMath.getSmartMoneyIntensity(data, 20);

                // Confidence Scoring (V11 OP Boost)
                const trendStrength = Math.min(100, ((price - cloudUpper) / cloudUpper) * 1000);
                const volRatio = current.volume / (volMA || 1);
                const volStrength = Math.min(100, (volRatio / config.volEntryMult) * 50);
                
                // Extra confidence if VCP is detected
                const vcpBoost = isVCP ? 20 : 0;
                // Institutional intensity boost
                const whaleBoost = Math.max(0, intensity / 2);

                const totalConfidence = Math.min(100, (trendStrength * 0.3) + (volStrength * 0.2) + (adx * 0.3) + vcpBoost + whaleBoost);

                const entryReason = `V11 OP Entry (${crossType})${isVCP ? ' + VCP Breakout' : ''}`;

                return {
                    symbol: ticker.config.symbol,
                    type: 'BUY',
                    price,
                    reason: entryReason,
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
            // --- V11 Exit Rules ---
            
            // 1. ATR Trailing Stop Update
            const dynamicStop = state.highestPrice - (atr * (config.atrTrailMult || 2.5));
            const currentTrailingStop = Math.max(state.trailingStopPrice || 0, dynamicStop);

            // 2. Partial Take Profit
            if (config.usePartialTP && !state.hasScaledOut) {
                if (price >= state.entryPrice * (1 + (config.tpTargetPct || 0.10))) {
                    return {
                        symbol: ticker.config.symbol,
                        type: 'SELL_PARTIAL',
                        price,
                        reason: 'V11 Partial TP (50%)',
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

            // V11: Smart Exit - If price violently drops below VWAP on high volume
            const condSmartExit = price < vwap && current.volume > volMA * 1.5;

            if (condKijun || condTrail || condVol || condSmartExit) {
                let reason = 'Bandar Distribusi';
                if (condKijun) reason = 'Tembus Kijun';
                if (condTrail) reason = 'ATR Trailing Hit';
                if (condSmartExit) reason = 'Smart Exit: Breakdown VWAP';

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
