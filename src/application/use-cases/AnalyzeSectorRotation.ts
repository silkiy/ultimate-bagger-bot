import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { DomainMath } from '../../core/domain/logic/Math';
import { logger } from '../../infrastructure/logging/WinstonLogger';

export interface SectorItem {
    name: string;
    heatScore: number; // 0-100
    momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    topConstituent: string;
}

export class AnalyzeSectorRotation {
    constructor(private marketData: IMarketDataProvider) { }

    async execute(): Promise<SectorItem[]> {
        logger.info('🔭 Analyzing Sector Rotation & Market Heatmap...');

        try {
            // 1. Fetch Universe (Expand to 35 for better sector coverage)
            if (!this.marketData.fetchTopActiveSymbols) return [];
            const activeSymbols = await this.marketData.fetchTopActiveSymbols('ID') || [];
            if (activeSymbols.length === 0) return [];

            // 2. Parallel Fetch & Process
            const scanLimit = 35;
            const rawData = await Promise.all(activeSymbols.slice(0, scanLimit).map(async (symbol) => {
                try {
                    if (!this.marketData.fetchFinancials || !this.marketData.fetchRealTimeQuote) return null;

                    const financials = await this.marketData.fetchFinancials(symbol);
                    if (!financials || !financials.sector || financials.sector === 'Tidak Tersedia') return null;

                    const startDate = new Date();
                    startDate.setDate(startDate.getDate() - 30);
                    const historical = await this.marketData.fetchHistoricalData(symbol, startDate);
                    if (historical.length < 15) return null;

                    const quote = await this.marketData.fetchRealTimeQuote(symbol);
                    if (!quote) return null;

                    return {
                        symbol,
                        sector: financials.sector,
                        changePercent: quote.changePercent,
                        intensity: DomainMath.getSmartMoneyIntensity(historical, 20)
                    };
                } catch {
                    return null;
                }
            }));

            // 3. Group by Sector
            const sectorsMap: Record<string, { changePercent: number, intensity: number, symbol: string }[]> = {};
            rawData.forEach(item => {
                if (!item) return;
                if (!sectorsMap[item.sector]) sectorsMap[item.sector] = [];
                sectorsMap[item.sector].push({
                    changePercent: item.changePercent,
                    intensity: item.intensity,
                    symbol: item.symbol
                });
            });

            // 4. Calculate Sector Scores
            const sectorResults: SectorItem[] = Object.entries(sectorsMap).map(([name, constituents]) => {
                const heatScore = DomainMath.getSectorHeatScore(constituents);

                // Find top constituent (highest intensity)
                const topConstituent = constituents.sort((a, b) => b.intensity - a.intensity)[0].symbol;

                let momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
                if (heatScore > 65) momentum = 'BULLISH';
                else if (heatScore < 35) momentum = 'BEARISH';

                return {
                    name,
                    heatScore,
                    momentum,
                    topConstituent: topConstituent.replace('.JK', '')
                };
            });

            // 5. Rank by Heat Score
            return sectorResults.sort((a, b) => b.heatScore - a.heatScore);

        } catch (error: any) {
            logger.error(`Sector Rotation Analysis Error: ${error.message}`);
            return [];
        }
    }
}
