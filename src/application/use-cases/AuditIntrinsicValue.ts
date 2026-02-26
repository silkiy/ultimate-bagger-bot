import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { DomainMath } from '../../core/domain/logic/Math';
import { logger } from '../../infrastructure/logging/WinstonLogger';

export interface ValuationReport {
    symbol: string;
    currentPrice: number;
    intrinsicValue: number;
    safetyMargin: number;
    eps: number;
    growthRate: number;
    bondYield: number;
    rating: 'UNDERVALUED' | 'FAIR' | 'OVERVALUED';
}

export class AuditIntrinsicValue {
    constructor(private marketData: IMarketDataProvider) { }

    async execute(symbol: string): Promise<ValuationReport | null> {
        try {
            const financials = await this.marketData.fetchFinancials?.(symbol);
            const quote = await this.marketData.fetchRealTimeQuote?.(symbol);

            if (!financials || !quote || !financials.eps || financials.eps <= 0) {
                logger.warn(`Insufficient financial data for valuation of ${symbol}`);
                return null;
            }

            const currentPrice = quote.price;
            const eps = financials.eps;

            // Heuristic Growth Rate (g): 
            // - Blue Chips: 8-12%
            // - Others: 3-5%
            // In a production app, we'd fetch this from analyst estimates.
            const isBlueChip = ['BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'TLKM.JK', 'ASII.JK'].includes(symbol);
            const growthRate = isBlueChip ? 10 : 5;

            // AAA Bond Yield (Y): Current Indo 10Y is ~6.6%
            const bondYield = 6.6;

            const intrinsicValue = DomainMath.calculateIntrinsicValue({ eps, growthRate, bondYield });

            // Safety Margin = (Intrinsic - Price) / Intrinsic
            const safetyMargin = ((intrinsicValue - currentPrice) / intrinsicValue) * 100;

            const rating = safetyMargin > 15 ? 'UNDERVALUED' : safetyMargin < -5 ? 'OVERVALUED' : 'FAIR';

            return {
                symbol,
                currentPrice,
                intrinsicValue,
                safetyMargin,
                eps,
                growthRate,
                bondYield,
                rating
            };
        } catch (error: any) {
            logger.error(`Error in AuditIntrinsicValue for ${symbol}: ${error.message}`);
            return null;
        }
    }
}
