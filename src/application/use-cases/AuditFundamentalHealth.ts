import { IMarketDataProvider, FinancialData } from '../../core/domain/interfaces/ExternalServices';
import { DomainMath } from '../../core/domain/logic/Math';
import { logger } from '../../infrastructure/logging/WinstonLogger';

export interface FundamentalAuditReport {
    symbol: string;
    fScore: number;
    zScore: number;
    rating: 'AAA' | 'AA' | 'A' | 'B' | 'C' | 'D';
    summary: string;
    metrics: {
        pe: number;
        pb: number;
        dividendYield: number;
        marketCap: number;
    };
    warnings: string[];
}

export class AuditFundamentalHealth {
    constructor(private marketData: IMarketDataProvider) { }

    async execute(symbol: string): Promise<FundamentalAuditReport | null> {
        try {
            logger.info(`🏛️ Auditing fundamental health for ${symbol}`);

            // 1. Fetch Standard Financials
            const financials = this.marketData.fetchFinancials ? await this.marketData.fetchFinancials(symbol) : null;
            if (!financials) return null;

            // 2. Try Deep Fundamentals
            const deep = this.marketData.fetchDeepFundamentals ? await this.marketData.fetchDeepFundamentals(symbol) : null;

            // 3. Scoring Logic
            let fScore = 0;
            let zScore = 0;
            const warnings: string[] = [];

            if (deep && deep.totalAssets) {
                // Calculate real Z-Score
                zScore = DomainMath.calculateAltmanZScore({
                    workingCapital: deep.workingCapital || 0,
                    retainedEarnings: deep.retainedEarnings || 0,
                    ebit: deep.ebit || 0,
                    marketCap: financials.marketCap || 0,
                    totalAssets: deep.totalAssets || 1,
                    totalLiabilities: deep.totalLiabilities || 0,
                    revenue: deep.revenue || 0
                });

                // Calculate Proxy F-Score (using current metrics since full history is often unstable for IDX)
                // In a perfect world, we'd fetch statement[1], but for now we audit "Presence of Health"
                if ((deep.netIncome || 0) > 0) fScore += 2; // Profitable
                if ((deep.operatingCashFlow || 0) > (deep.netIncome || 0)) fScore += 2; // Quality of cash
                if ((deep.totalDebt || 0) < (deep.totalCash || 0)) fScore += 2; // Debt coverage
                if ((financials.pe || 0) < 15 && (financials.pe || 0) > 0) fScore += 1; // Valuation sanity
                if ((financials.pb || 0) < 2) fScore += 1; // Asset sanity
                if ((financials.dividendYield || 0) > 0.02) fScore += 1; // Yielding
            } else {
                // FALLBACK: Light Audit for symbols with restricted deep modules
                warnings.push('Deep financial modules restricted. Using "Synthetic Quality Proxy".');

                // Synthetic F-Score logic (0-9 scale)
                if ((financials.eps || 0) > 0) fScore += 2;
                if ((financials.pe || 0) > 0 && (financials.pe || 0) < 12) fScore += 2;
                if ((financials.pb || 0) > 0 && (financials.pb || 0) < 1.5) fScore += 2;
                if ((financials.dividendYield || 0) > 0.03) fScore += 2;
                if ((financials.marketCap || 0) > 5000000000000) fScore += 1; // Large cap stability (IDR 5T)

                zScore = 0; // Not calculable without balance sheet
            }

            // 4. Rating Assignment
            let rating: 'AAA' | 'AA' | 'A' | 'B' | 'C' | 'D' = 'C';
            if (fScore >= 8) rating = 'AAA';
            else if (fScore >= 6) rating = 'AA';
            else if (fScore >= 4) rating = 'A';
            else if (fScore >= 2) rating = 'B';
            else rating = 'C';

            if (zScore > 0 && zScore < 1.8) {
                rating = 'D';
                warnings.push('CRITICAL: Altman Z-Score indicates high distress risk.');
            }

            const summary = this.generateSummary(rating, fScore, zScore);

            return {
                symbol,
                fScore,
                zScore,
                rating,
                summary,
                metrics: {
                    pe: financials.pe || 0,
                    pb: financials.pb || 0,
                    dividendYield: (financials.dividendYield || 0) * 100,
                    marketCap: financials.marketCap || 0
                },
                warnings
            };

        } catch (error: any) {
            logger.error(`Fundamental audit failed for ${symbol}: ${error.message}`);
            return null;
        }
    }

    private generateSummary(rating: string, f: number, z: number): string {
        if (rating === 'AAA') return 'Sovereign Grade. Exceptional financial health and quality.';
        if (rating === 'AA') return 'Institutional Grade. Solid fundamentals with strong coverage.';
        if (rating === 'A') return 'Safe Haven. Healthy financial metrics, suitable for long-term.';
        if (rating === 'B') return 'Speculative Quality. Decent metrics but requires monitoring.';
        if (rating === 'C') return 'Poor Quality. Fundamental weaknesses detected.';
        if (rating === 'D') return 'Distressed Asset. High risk of financial instability.';
        return 'Not Rated.';
    }
}
