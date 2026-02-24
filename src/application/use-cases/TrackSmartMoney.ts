import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { DomainMath } from '../../core/domain/logic/Math';
import { logger } from '../../infrastructure/logging/WinstonLogger';

export interface SmartMoneyItem {
    symbol: string;
    price: number;
    intensity: number; // -100 to 100
    isAccumulating: boolean; // Quiet accumulation check
    volumeSurge: number;
}

export class TrackSmartMoney {
    constructor(private marketData: IMarketDataProvider) { }

    async execute(): Promise<SmartMoneyItem[]> {
        logger.info('📡 Scanning for Smart Money & Quiet Accumulation...');

        try {
            // 1. Fetch Candidates (Trending + Active)
            const activeSymbols = await this.marketData.fetchTopActiveSymbols?.('ID') || [];
            if (activeSymbols.length === 0) return [];

            // 2. Parallel Analysis
            const results = await Promise.all(activeSymbols.slice(0, 40).map(async (symbol) => {
                try {
                    const startDate = new Date();
                    startDate.setDate(startDate.getDate() - 40);

                    const data = await this.marketData.fetchHistoricalData(symbol, startDate);
                    if (data.length < 20) return null;

                    const intensity = DomainMath.getSmartMoneyIntensity(data, 20);
                    const isAccumulating = DomainMath.detectQuietAccumulation(data);
                    const volumeSurge = DomainMath.calculateVolumeSurge(data, 10);

                    const lastData = data[data.length - 1];

                    // Criteria: High Intensity OR Quiet Accumulation
                    if (intensity > 30 || isAccumulating) {
                        return {
                            symbol,
                            price: lastData.close,
                            intensity,
                            isAccumulating,
                            volumeSurge
                        };
                    }
                    return null;
                } catch {
                    return null;
                }
            }));

            // 3. Filter and Sort
            return results
                .filter((r): r is SmartMoneyItem => r !== null)
                .sort((a, b) => {
                    // Accumulation prioritize
                    if (a.isAccumulating && !b.isAccumulating) return -1;
                    if (!a.isAccumulating && b.isAccumulating) return 1;
                    return b.intensity - a.intensity;
                })
                .slice(0, 10);

        } catch (error: any) {
            logger.error(`Smart Money Scan Error: ${error.message}`);
            return [];
        }
    }
}
