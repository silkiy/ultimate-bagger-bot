import { OHLCV } from '../entities/MarketData';

/**
 * Pure functions for financial calculations.
 * No external dependencies allowed.
 */

export class DomainMath {
    static getDonchian(slice: OHLCV[]): number {
        if (slice.length === 0) return 0;
        const highs = slice.map(d => d.high);
        const lows = slice.map(d => d.low);
        const high = Math.max(...highs);
        const low = Math.min(...lows);
        return (high + low) / 2;
    }

    static getSMA(slice: OHLCV[], period: number): number {
        if (slice.length < period) return 0;
        const data = slice.slice(-period);
        const sum = data.reduce((acc, d) => acc + (d.adjclose || d.close || 0), 0);
        return sum / period;
    }

    static getVolumeSMA(slice: OHLCV[], period: number): number {
        if (slice.length < period) return 0;
        const data = slice.slice(-period);
        const sum = data.reduce((acc, d) => acc + (d.volume || 0), 0);
        return sum / period;
    }

    static getATR(data: OHLCV[], period: number): number {
        if (data.length <= period) return 0;

        const trs: number[] = [];
        for (let i = 1; i < data.length; i++) {
            const high = data[i].high;
            const low = data[i].low;
            const prevClose = data[i - 1].close;

            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trs.push(tr);
        }

        const recentTRs = trs.slice(-period);
        return recentTRs.reduce((a, b) => a + b, 0) / period;
    }

    static getEMA(data: number[], period: number): number {
        if (data.length === 0) return 0;
        const k = 2 / (period + 1);
        let ema = data[0];
        for (let i = 1; i < data.length; i++) {
            ema = data[i] * k + ema * (1 - k);
        }
        return ema;
    }

    /**
     * ADX (Average Directional Index)
     * Returns a score 0-100 indicating trend strength.
     */
    static getADX(data: OHLCV[], period: number = 14): number {
        if (data.length < period * 2) return 0;

        const trs: number[] = [];
        const plusDM: number[] = [];
        const minusDM: number[] = [];

        for (let i = 1; i < data.length; i++) {
            const high = data[i].high;
            const low = data[i].low;
            const prevHigh = data[i - 1].high;
            const prevLow = data[i - 1].low;
            const prevClose = data[i - 1].close;

            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trs.push(tr);

            const upMove = high - prevHigh;
            const downMove = prevLow - low;

            if (upMove > downMove && upMove > 0) {
                plusDM.push(upMove);
            } else {
                plusDM.push(0);
            }

            if (downMove > upMove && downMove > 0) {
                minusDM.push(downMove);
            } else {
                minusDM.push(0);
            }
        }

        // Wilder's Smoothing / Rough EMA
        const smooth = (arr: number[], p: number) => {
            let res: number[] = [];
            let sum = arr.slice(0, p).reduce((a, b) => a + b, 0);
            res.push(sum);
            for (let i = p; i < arr.length; i++) {
                sum = sum - (sum / p) + arr[i];
                res.push(sum);
            }
            return res;
        };

        const smoothTR = smooth(trs, period);
        const smoothPlusDM = smooth(plusDM, period);
        const smoothMinusDM = smooth(minusDM, period);

        const dxs: number[] = [];
        for (let i = 0; i < smoothTR.length; i++) {
            const diPlus = (smoothPlusDM[i] / (smoothTR[i] || 1)) * 100;
            const diMinus = (smoothMinusDM[i] / (smoothTR[i] || 1)) * 100;
            const diff = Math.abs(diPlus - diMinus);
            const sum = diPlus + diMinus;
            dxs.push((diff / (sum || 1)) * 100);
        }

        // Final ADX is EMA of DX
        return this.getEMA(dxs, period);
    }

    /**
     * Calculate Volume Surge Factor (Today's Vol / N-Day Avg Vol)
     */
    static calculateVolumeSurge(data: OHLCV[], period: number = 10): number {
        if (data.length <= period) return 0;
        const recent = data[data.length - 1].volume || 0;
        const avg = data.slice(-period - 1, -1).reduce((a, b) => a + (b.volume || 0), 0) / period;
        return avg > 0 ? recent / avg : 0;
    }

    /**
     * Detect "Quiet Accumulation" 
     * Formula: High Volume Spike (>1.5x) AND Low Price Movement (<1%)
     */
    static detectQuietAccumulation(data: OHLCV[]): boolean {
        if (data.length < 10) return false;
        const current = data[data.length - 1];
        const prev = data[data.length - 2];

        const surge = this.calculateVolumeSurge(data, 10);
        const priceChange = Math.abs((current.close - prev.close) / (prev.close || 1));

        return surge > 1.5 && priceChange < 0.01;
    }

    /**
     * Calculate Smart Money Intensity (-100 to 100)
     * Based on Money Flow Multiplier logic (Chaikin variation)
     */
    static getSmartMoneyIntensity(data: OHLCV[], period: number = 20): number {
        if (data.length < period) return 0;
        const slice = data.slice(-period);

        let mfVolumeSum = 0;
        let volumeSum = 0;

        slice.forEach(d => {
            const high = d.high;
            const low = d.low;
            const close = d.close;
            const vol = d.volume || 0;

            const range = high - low;
            const multiplier = range === 0 ? 0 : ((close - low) - (high - close)) / range;

            mfVolumeSum += (multiplier * vol);
            volumeSum += vol;
        });

        return volumeSum === 0 ? 0 : Math.round((mfVolumeSum / volumeSum) * 100);
    }

    /**
     * Calculate Sector Heat Score (0-100)
     * Aggregates momentum and smart money intensity of constituent stocks
     */
    static getSectorHeatScore(constituents: { changePercent: number, intensity: number }[]): number {
        if (constituents.length === 0) return 0;

        const avgChange = constituents.reduce((a, b) => a + b.changePercent, 0) / constituents.length;
        const avgIntensity = constituents.reduce((a, b) => a + b.intensity, 0) / constituents.length;

        // Weights: 40% Momentum, 60% Institutional Intensity
        const momentumScore = Math.min(Math.max((avgChange + 5) * 10, 0), 100); // Normalized -5% to +5%
        const intensityScore = Math.min(Math.max((avgIntensity + 100) / 2, 0), 100); // Normalized -100 to 100

        return Math.round((momentumScore * 0.4) + (intensityScore * 0.6));
    }

    /**
     * Detect Bullish Candlestick Patterns (Hammer, Engulfing, Marubozu)
     */
    static detectPatterns(data: OHLCV[]): string[] {
        if (data.length < 5) return [];
        const patterns: string[] = [];
        const current = data[data.length - 1];
        const prev = data[data.length - 2];

        const body = Math.abs(current.close - current.open);
        const candleRange = Math.max(0.1, current.high - current.low);
        const isBullish = current.close > current.open;

        // 1. Hammer Detection
        const lowerShadow = Math.min(current.open, current.close) - current.low;
        const upperShadow = current.high - Math.max(current.open, current.close);
        if (lowerShadow > (body * 2) && upperShadow < (body * 0.5) && body > 0) {
            patterns.push('HAMMER');
        }

        // 2. Bullish Engulfing
        const prevBody = Math.abs(prev.close - prev.open);
        if (prev.close < prev.open && current.close > current.open &&
            current.open <= prev.close && current.close >= prev.open &&
            body > prevBody) {
            patterns.push('BULLISH-ENGULFING');
        }

        // 3. Marubozu (Strong Body, Tiny Shadows)
        if (body > (candleRange * 0.9) && body > 0) {
            patterns.push(isBullish ? 'BULLISH-MARUBOZU' : 'BEARISH-MARUBOZU');
        }

        return patterns;
    }
}
