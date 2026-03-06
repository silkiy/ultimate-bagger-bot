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

        // Tuning: Tighten price change to 1.2% for more "Quiet" institutional detection
        return surge > 1.5 && priceChange < 0.012;
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
        // Tuning: More realistic normalization for IDX averages
        const momentumScore = Math.min(Math.max((avgChange + 3) * 16.6, 0), 100); // Normalized -3% to +3%
        const intensityScore = Math.min(Math.max((avgIntensity + 50), 0), 100); // Normalized -50 to 50 (Sweet spot)

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

    /**
     * Calculate Fibonacci Retracement Levels
     * Levels: 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1
     */
    static calculateFibLevels(high: number, low: number): { [key: string]: number } {
        const diff = high - low;
        return {
            '0': high,
            '0.236': high - (diff * 0.236),
            '0.382': high - (diff * 0.382),
            '0.5': high - (diff * 0.5),
            '0.618': high - (diff * 0.618),
            '0.786': high - (diff * 0.786),
            '1': low,
            'extension1.618': high + (diff * 0.618)
        };
    }

    /**
     * Calculate Pivot Points (Classic)
     * Returns Pivot, R1, R2, S1, S2
     */
    static calculatePivotPoints(high: number, low: number, close: number): { P: number, R1: number, R2: number, S1: number, S2: number } {
        const P = (high + low + close) / 3;
        const R1 = (2 * P) - low;
        const S1 = (2 * P) - high;
        const R2 = P + (high - low);
        const S2 = P - (high - low);
        
        return { P, R1, R2, S1, S2 };
    }

    /**
     * Detect Market Stress Index (MSI)
     * Detects if market volatility is spiking (Panic/Black Swan)
     */
    static calculateMarketStressIndex(indexData: OHLCV[], period: number = 20): { isHighStress: boolean, stressScore: number } {
        if (indexData.length < period + 5) return { isHighStress: false, stressScore: 0 };
        
        const recentATR = this.getATR(indexData, 5);
        const avgATR = this.getATR(indexData.slice(0, -5), period);
        
        const stressScore = avgATR > 0 ? recentATR / avgATR : 1;
        // If current volatility is 1.6x higher than average, it's a panic market
        return {
            isHighStress: stressScore > 1.6,
            stressScore
        };
    }

    /**
     * Calculates the correlation between two sets of price returns (Pearson's coefficient).
     * Institutional use: Detect systemic risk and ensure diversification.
     */
    static calculateCorrelation(dataA: OHLCV[], dataB: OHLCV[]): number {
        const pricesA = dataA.map(d => d.adjclose || d.close);
        const pricesB = dataB.map(d => d.adjclose || d.close);
        
        const minLen = Math.min(pricesA.length, pricesB.length);
        const sliceA = pricesA.slice(-minLen);
        const sliceB = pricesB.slice(-minLen);

        if (sliceA.length < 5) return 0;

        const returnsA = this.calculateReturns(sliceA);
        const returnsB = this.calculateReturns(sliceB);

        const meanA = returnsA.reduce((a, b) => a + b, 0) / returnsA.length;
        const meanB = returnsB.reduce((a, b) => a + b, 0) / returnsB.length;

        let num = 0;
        let denA = 0;
        let denB = 0;

        for (let i = 0; i < returnsA.length; i++) {
            const diffA = returnsA[i] - meanA;
            const diffB = returnsB[i] - meanB;
            num += diffA * diffB;
            denA += diffA * diffA;
            denB += diffB * diffB;
        }

        const Den = Math.sqrt(denA * denB);
        return Den === 0 ? 0 : num / Den;
    }

    private static calculateReturns(prices: number[]): number[] {
        const returns: number[] = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / (prices[i - 1] || 1));
        }
        return returns;
    }

    /**
     * Calculates annualized volatility.
     */
    static calculateVolatility(prices: number[]): number {
        const returns = this.calculateReturns(prices);
        if (returns.length === 0) return 0;
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        return Math.sqrt(variance) * Math.sqrt(252); // Annualized 252 trading days
    }

    /**
     * Calculates the Piotroski F-Score (0-9).
     * Institutional-grade quality audit for financial health.
     */
    static calculatePiotroskiFScore(metrics: {
        netIncome: number;
        operatingCashFlow: number;
        roa: number;
        prevRoa: number;
        prevOperatingCashFlow: number;
        accruals: number; // OCF - Net Income
        prevLeverage: number;
        currLeverage: number;
        prevLiquidity: number;
        currLiquidity: number;
        sharesIssued: boolean;
        prevMargin: number;
        currMargin: number;
        prevTurnover: number;
        currTurnover: number;
    }): number {
        let score = 0;

        // Profitability
        if (metrics.netIncome > 0) score++;
        if (metrics.operatingCashFlow > 0) score++;
        if (metrics.roa > metrics.prevRoa) score++;
        if (metrics.operatingCashFlow > metrics.netIncome) score++;

        // Leverage, Liquidity and Source of Funds
        if (metrics.currLeverage < metrics.prevLeverage) score++;
        if (metrics.currLiquidity > metrics.prevLiquidity) score++;
        if (!metrics.sharesIssued) score++;

        // Operating Efficiency
        if (metrics.currMargin > metrics.prevMargin) score++;
        if (metrics.currTurnover > metrics.prevTurnover) score++;

        return score;
    }

    /**
     * Calculates Altman Z-Score (Solvency/Bankruptcy risk).
     * Formula: 1.2A + 1.4B + 3.3C + 0.6D + 1.0E
     */
    static calculateAltmanZScore(metrics: {
        workingCapital: number;
        retainedEarnings: number;
        ebit: number;
        marketCap: number;
        totalAssets: number;
        totalLiabilities: number;
        revenue: number;
    }): number {
        if (metrics.totalAssets === 0) return 0;

        const A = metrics.workingCapital / metrics.totalAssets;
        const B = metrics.retainedEarnings / metrics.totalAssets;
        const C = metrics.ebit / metrics.totalAssets;
        const D = metrics.marketCap / Math.max(1, metrics.totalLiabilities);
        const E = metrics.revenue / metrics.totalAssets;

        const score = (1.2 * A) + (1.4 * B) + (3.3 * C) + (0.6 * D) + (1.0 * E);
        return Math.round(score * 100) / 100;
    }

    // ─── Sentiment Intelligence (NLP Engine v18) ────────────────────────

    /**
     * Bilingual financial lexicon for headline sentiment scoring.
     * Returns a score from -100 (extreme fear) to +100 (extreme greed).
     */
    static analyzeSentimentFromHeadlines(headlines: string[]): {
        score: number;
        label: 'EXTREME_GREED' | 'GREED' | 'NEUTRAL' | 'FEAR' | 'EXTREME_FEAR';
        bullishCount: number;
        bearishCount: number;
        totalAnalyzed: number;
    } {
        if (headlines.length === 0) {
            return { score: 0, label: 'NEUTRAL', bullishCount: 0, bearishCount: 0, totalAnalyzed: 0 };
        }

        // Bilingual Financial Lexicons (EN + ID)
        const bullishWords = [
            // English
            'surge', 'soar', 'rally', 'breakout', 'bullish', 'upgrade', 'beat', 'record',
            'growth', 'profit', 'gain', 'rise', 'jump', 'strong', 'boom', 'outperform',
            'buy', 'accumulate', 'overweight', 'positive', 'recover', 'dividend',
            // Indonesian
            'naik', 'meroket', 'menguat', 'laba', 'untung', 'positif', 'melonjak',
            'tumbuh', 'kinerja', 'dividen', 'rekor', 'prospek', 'cerah', 'bagus',
            'akumulasi', 'beli', 'optimis', 'menembus', 'penguatan'
        ];

        const bearishWords = [
            // English
            'crash', 'plunge', 'drop', 'sell', 'bearish', 'downgrade', 'miss', 'loss',
            'decline', 'fall', 'weak', 'risk', 'fear', 'recession', 'default', 'bankruptcy',
            'underperform', 'underweight', 'negative', 'warning', 'cut', 'layoff',
            // Indonesian
            'turun', 'anjlok', 'melemah', 'rugi', 'negatif', 'merosot', 'tertekan',
            'koreksi', 'ambruk', 'jatuh', 'gagal', 'resiko', 'pelemahan', 'defisit',
            'penurunan', 'jual', 'pesimis', 'merugi', 'tekanan'
        ];

        let bullishCount = 0;
        let bearishCount = 0;

        for (const headline of headlines) {
            const lower = headline.toLowerCase();
            for (const word of bullishWords) {
                if (lower.includes(word)) { bullishCount++; break; }
            }
            for (const word of bearishWords) {
                if (lower.includes(word)) { bearishCount++; break; }
            }
        }

        const total = bullishCount + bearishCount;
        let score = 0;
        if (total > 0) {
            score = Math.round(((bullishCount - bearishCount) / total) * 100);
        }

        // Clamp to -100..+100
        score = Math.max(-100, Math.min(100, score));

        let label: 'EXTREME_GREED' | 'GREED' | 'NEUTRAL' | 'FEAR' | 'EXTREME_FEAR' = 'NEUTRAL';
        if (score >= 60) label = 'EXTREME_GREED';
        else if (score >= 20) label = 'GREED';
        else if (score <= -60) label = 'EXTREME_FEAR';
        else if (score <= -20) label = 'FEAR';

        return { score, label, bullishCount, bearishCount, totalAnalyzed: headlines.length };
    }

    /**
     * Market-derived sentiment from technical data.
     * Uses price momentum, volume trend, and volatility compression
     * to derive a "Market Mood" score (-100 to +100).
     */
    static calculateMarketSentiment(data: OHLCV[]): {
        score: number;
        label: 'EXTREME_GREED' | 'GREED' | 'NEUTRAL' | 'FEAR' | 'EXTREME_FEAR';
        momentum: number;
        volumeTrend: number;
        volatilitySignal: number;
    } {
        if (data.length < 20) {
            return { score: 0, label: 'NEUTRAL', momentum: 0, volumeTrend: 0, volatilitySignal: 0 };
        }

        const recent = data.slice(-20);
        const older = data.slice(-40, -20);

        // 1. Price Momentum (-100 to +100)
        const recentClose = recent[recent.length - 1].close;
        const sma20 = recent.reduce((s, d) => s + d.close, 0) / recent.length;
        const momentum = Math.round(((recentClose - sma20) / sma20) * 1000); // Scale to readable range
        const momentumClamped = Math.max(-100, Math.min(100, momentum));

        // 2. Volume Trend (-100 to +100)
        const recentAvgVol = recent.reduce((s, d) => s + d.volume, 0) / recent.length;
        const olderAvgVol = older.length > 0
            ? older.reduce((s, d) => s + d.volume, 0) / older.length
            : recentAvgVol;
        const volChange = olderAvgVol > 0 ? ((recentAvgVol - olderAvgVol) / olderAvgVol) * 100 : 0;
        const volumeTrend = Math.max(-100, Math.min(100, Math.round(volChange)));

        // 3. Volatility Compression Signal (-100 to +100)
        // Low volatility with rising price = bullish compression (greed)
        // High volatility with falling price = bearish expansion (fear)
        const recentReturns = recent.slice(1).map((d, i) => (d.close - recent[i].close) / recent[i].close);
        const avgReturn = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
        const stdDev = Math.sqrt(recentReturns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / recentReturns.length);
        const annualizedVol = stdDev * Math.sqrt(252);

        let volatilitySignal = 0;
        if (annualizedVol < 0.2 && momentumClamped > 0) volatilitySignal = 50;  // Quiet bullish
        else if (annualizedVol < 0.2) volatilitySignal = 20; // Quiet neutral
        else if (annualizedVol > 0.5 && momentumClamped < 0) volatilitySignal = -60; // Volatile bearish
        else if (annualizedVol > 0.5) volatilitySignal = -30; // Volatile uncertain

        // Composite Score: weighted average
        const compositeScore = Math.round(
            (momentumClamped * 0.50) +
            (volumeTrend * 0.25) +
            (volatilitySignal * 0.25)
        );
        const score = Math.max(-100, Math.min(100, compositeScore));

        let label: 'EXTREME_GREED' | 'GREED' | 'NEUTRAL' | 'FEAR' | 'EXTREME_FEAR' = 'NEUTRAL';
        if (score >= 60) label = 'EXTREME_GREED';
        else if (score >= 20) label = 'GREED';
        else if (score <= -60) label = 'EXTREME_FEAR';
        else if (score <= -20) label = 'FEAR';

        return { score, label, momentum: momentumClamped, volumeTrend, volatilitySignal };
    }
    /**
     * Prime Alpha Score (v11.0) — The "Institutional Holy Grail" Score.
     * Combines multiple factors into a single 0-100 conviction metric.
     * Weights: Technical (30%), Fundamental (30%), Sentiment (20%), Smart Money (20%)
     */
    static calculatePrimeAlphaScore(metrics: {
        technicalStrength: number; // 0-100 (ADX/Cloud)
        fundamentalRating: number; // 0-10 (Normalized F-Score/Z-Score)
        sentimentScore: number;    // -100 to 100
        institutionalIntensity: number; // -100 to 100
    }): number {
        // Normalize all to 0-100 scale
        const technical = Math.min(Math.max(metrics.technicalStrength, 0), 100);
        const fundamental = metrics.fundamentalRating * 10;
        const sentiment = (metrics.sentimentScore + 100) / 2;
        const intensity = (metrics.institutionalIntensity + 100) / 2;

        const alpha = (technical * 0.3) + (fundamental * 0.3) + (sentiment * 0.2) + (intensity * 0.2);
        return Math.round(alpha);
    }

    /**
     * Calculate Market Breadth (v11.0).
     * Returns the percentage of assets trading above their SMA-50.
     * Institutions use this as a "Real Market Health" gauge.
     */
    /**
     * Calculate Market Breadth (v11.0).
     * Returns the percentage of assets trading above their SMA-50.
     * Institutions use this as a "Real Market Health" gauge.
     */
    static calculateMarketBreadth(assets: { currentPrice: number, sma50: number }[]): number {
        if (assets.length === 0) return 0;
        const aboveCount = assets.filter(a => a.currentPrice > a.sma50 && a.sma50 > 0).length;
        return Math.round((aboveCount / assets.length) * 100);
    }

    /**
     * Calculate Intrinsic Value (v13.0)
     * Using Benjamin Graham Formula: V = EPS * (8.5 + 2g) * 4.4 / Y
     * where g = expected growth rate, Y = current yield on AAA corporate bonds
     */
    static calculateIntrinsicValue(metrics: {
        eps: number,
        growthRate: number, // e.g., 10 for 10%
        bondYield: number   // e.g., 6.5 for 6.5%
    }): number {
        if (metrics.eps <= 0) return 0;
        // Adjusted Graham Formula for modern times
        // Safety Margin is usually applied after this calculation
        const value = (metrics.eps * (8.5 + 2 * metrics.growthRate) * 4.4) / metrics.bondYield;
        return Math.round(Math.max(0, value));
    }

    /**
     * Calculate VWAP (Volume Weighted Average Price) for a given window
     */
    static getVWAP(data: OHLCV[], period: number): number {
        if (data.length < period) return 0;
        const slice = data.slice(-period);
        let cumulativeTPV = 0; // Typical Price x Volume
        let cumulativeVolume = 0;

        for (const bar of slice) {
            const typicalPrice = (bar.high + bar.low + bar.close) / 3;
            cumulativeTPV += typicalPrice * bar.volume;
            cumulativeVolume += bar.volume;
        }

        return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
    }

    /**
     * Calculate Volume Profile (Point of Control)
     * Finds the price level with the highest traded volume in the lookback period.
     */
    static getVolumePointOfControl(data: OHLCV[], period: number = 50, bins: number = 20): number {
        if (data.length < period) return 0;
        const slice = data.slice(-period);
        
        let highest = Math.max(...slice.map(d => d.high));
        let lowest = Math.min(...slice.map(d => d.low));
        
        if (highest === lowest) return highest;

        const binSize = (highest - lowest) / bins;
        const profile = new Array(bins).fill(0);

        for (const bar of slice) {
            const typicalPrice = (bar.high + bar.low + bar.close) / 3;
            const binIndex = Math.min(Math.floor((typicalPrice - lowest) / binSize), bins - 1);
            profile[binIndex] += bar.volume;
        }

        let maxVol = 0;
        let pocBin = 0;
        for (let i = 0; i < bins; i++) {
            if (profile[i] > maxVol) {
                maxVol = profile[i];
                pocBin = i;
            }
        }

        // Return the price representing the center of the POC bin
        return lowest + (pocBin * binSize) + (binSize / 2);
    }

    /**
     * Detect Volatility Contraction Pattern (VCP)
     * Checks if volatility is shrinking over recent periods while volume dries up, indicating accumulation before breakout.
     */
    static detectVCP(data: OHLCV[]): boolean {
        if (data.length < 20) return false;
        
        const recentATR = this.getATR(data, 5);
        const pastATR = this.getATR(data.slice(0, -5), 15);
        
        const recentVol = this.getVolumeSMA(data, 5);
        const pastVol = this.getVolumeSMA(data.slice(0, -5), 15);

        // Volatility is shrinking AND volume is drying up (Supply is exhausted)
        return (recentATR < pastATR * 0.7) && (recentVol < pastVol * 0.7);
    }

    /**
     * Broker Summary Classification (v13.2)
     * Algorithmic proxy for IDX Broker Summary labels.
     * Uses Smart Money Intensity and Volume Surge.
     */
    static getBrokerSummaryLabel(data: OHLCV[]): string {
        const intensity = this.getSmartMoneyIntensity(data, 20);
        const surge = this.calculateVolumeSurge(data, 10);

        if (intensity > 40 && surge > 1.8) return 'BIG ACCUM';
        if (intensity > 15) return 'ACCUM';
        if (intensity < -40 && surge > 1.8) return 'BIG DIST';
        if (intensity < -15) return 'DIST';
        return 'NEUTRAL';
    }
}
