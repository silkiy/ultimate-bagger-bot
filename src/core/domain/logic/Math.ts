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
}
