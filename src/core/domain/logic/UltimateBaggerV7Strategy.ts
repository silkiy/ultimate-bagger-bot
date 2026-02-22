import { DomainTicker } from '../entities/Ticker';
import { OHLCV, Signal } from '../entities/MarketData';
import { IStrategy } from '../interfaces/Strategy';
import { DomainMath } from '../logic/Math';

export class UltimateBaggerV7Strategy implements IStrategy {
    calculateSignal(ticker: DomainTicker, data: OHLCV[], isMarketBullish: boolean): Signal {
        const { config, state } = ticker;
        const current = data[data.length - 1];
        const prev = data[data.length - 2];

        if (!current || !prev) {
            return this.createHoldSignal(ticker, 'Insufficient data');
        }

        const price = current.adjclose || current.close;
        const prevPrice = prev.adjclose || prev.close;

        const tenkan = DomainMath.getDonchian(data.slice(-config.tenkanPeriod));
        const kijun = DomainMath.getDonchian(data.slice(-config.kijunPeriod));
        const volMA = DomainMath.getVolumeSMA(data, 20);

        // Ichimoku Cloud Logic
        const pastData = data.slice(0, -config.displacement);
        const pastTenkan = DomainMath.getDonchian(pastData.slice(-config.tenkanPeriod));
        const pastKijun = DomainMath.getDonchian(pastData.slice(-config.kijunPeriod));
        const spanA = (pastTenkan + pastKijun) / 2;
        const spanB = DomainMath.getDonchian(pastData.slice(-config.spanBPeriod));
        const cloudUpper = Math.max(spanA, spanB);

        const prevTenkan = DomainMath.getDonchian(data.slice(-config.tenkanPeriod - 1, -1));
        const prevKijun = DomainMath.getDonchian(data.slice(-config.kijunPeriod - 1, -1));

        const aboveCloud = price > cloudUpper;
        const volRatio = current.volume / (volMA || 1);
        const volValid = volRatio > config.volEntryMult && price > current.open;

        if (!state.isHolding) {
            // Entry Rules
            let trigger = false;
            let crossType = '';
            if (config.entryRule === 'STANDARD') {
                trigger = prevTenkan <= prevKijun && tenkan > kijun;
                crossType = 'Tenkan x Kijun';
            } else if (config.entryRule === 'AGGRESSIVE') {
                trigger = prevPrice <= prevTenkan && price > tenkan;
                crossType = 'Price x Tenkan';
            } else if (config.entryRule === 'PULLBACK') {
                trigger = prevPrice <= prevKijun && price > kijun;
                crossType = 'Price x Kijun';
            }

            if (trigger && aboveCloud && volValid) {
                // Calculate Confidence
                const trendStrength = Math.min(100, ((price - cloudUpper) / cloudUpper) * 1000); // Distance from cloud
                const volStrength = Math.min(100, (volRatio / config.volEntryMult) * 50);
                const totalConfidence = (trendStrength * 0.4) + (volStrength * 0.6);

                return {
                    symbol: ticker.config.symbol,
                    type: 'BUY',
                    price,
                    reason: `V7 Ichimoku ${crossType} Entry`,
                    timestamp: new Date(),
                    confidence: { trend: trendStrength, volume: volStrength, total: totalConfidence },
                    breakdown: {
                        isAboveCloud: aboveCloud,
                        isCrossed: trigger,
                        isVolumeBreakout: volValid,
                        kijunLevel: kijun,
                        tenkanLevel: tenkan,
                        stopLoss: state.highestPrice * (1 - config.trailPercent)
                    }
                };
            }
        } else {
            // Exit Rules
            const trailingStop = state.highestPrice * (1 - config.trailPercent);

            const condKijun = config.useExitKijun && (prevPrice >= prevKijun && price < kijun);
            const condTrail = config.useTrailing && (price < trailingStop);
            const condVol = config.useVolExit && (price < current.open && current.volume > volMA * config.volDistMult);

            if (condKijun || condTrail || condVol) {
                const reason = condKijun ? 'Kijun Cross' : condTrail ? 'Trailing Stop' : 'Distribution Volume';
                return {
                    symbol: ticker.config.symbol,
                    type: 'SELL',
                    price,
                    reason,
                    timestamp: new Date(),
                    breakdown: {
                        isAboveCloud: aboveCloud,
                        isCrossed: condKijun,
                        isVolumeBreakout: condVol,
                        kijunLevel: kijun,
                        tenkanLevel: tenkan,
                        stopLoss: trailingStop
                    }
                };
            }
        }

        return this.createHoldSignal(ticker, 'No actionable signal');
    }

    private createHoldSignal(ticker: DomainTicker, reason: string): Signal {
        return {
            symbol: ticker.config.symbol,
            type: 'HOLD',
            price: 0,
            reason,
            timestamp: new Date()
        };
    }
}
