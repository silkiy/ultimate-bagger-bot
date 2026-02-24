import YahooFinance from 'yahoo-finance2';
import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { OHLCV } from '../../core/domain/entities/MarketData';
import { logger } from '../logging/WinstonLogger';

// yahoo-finance2 v3 requires explicit instantiation
const yahoo = new YahooFinance();

export class YahooFinanceProvider implements IMarketDataProvider {
    constructor() { }

    /**
     * Fetch historical OHLCV data (daily, weekly, or monthly candles)
     */
    async fetchHistoricalData(symbol: string, startDate: Date, interval: '1d' | '1wk' | '1mo' = '1d'): Promise<OHLCV[]> {
        try {
            const result = await yahoo.chart(symbol, {
                period1: startDate,
                interval: interval,
            }) as any;

            if (!result || !result.quotes || result.quotes.length === 0) {
                logger.warn(`No data returned for ${symbol} with interval ${interval}`);
                return [];
            }

            return result.quotes
                .filter((q: any) => q.close !== null && q.close !== undefined)
                .map((q: any) => ({
                    date: q.date,
                    open: q.open ?? 0,
                    high: q.high ?? 0,
                    low: q.low ?? 0,
                    close: q.close ?? 0,
                    volume: q.volume ?? 0,
                    adjclose: q.adjclose ?? q.close ?? 0,
                }));
        } catch (error: any) {
            logger.error(`Error fetching historical (${interval}) data for ${symbol}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Fetch financial data (PE, PB, EPS)
     */
    async fetchFinancials(symbol: string): Promise<{
        symbol: string;
        pe?: number;
        pb?: number;
        eps?: number;
        marketCap?: number;
        sector?: string;
        industry?: string;
    } | null> {
        try {
            const result = await yahoo.quote(symbol) as any;
            if (!result) return null;

            return {
                symbol,
                pe: result.trailingPE || result.forwardPE,
                pb: result.priceToBook,
                eps: result.trailingEps,
                marketCap: result.marketCap,
                sector: result.sector || result.industryDisp,
                industry: result.industry
            };
        } catch (error: any) {
            logger.error(`Error fetching financials for ${symbol}: ${error.message}`);
            return null;
        }
    }

    /**
     * Fetch Top Gainers for a specific region
     */
    async fetchTopGainers(region: string = 'ID'): Promise<string[]> {
        try {
            const screenRes = await (yahoo as any).screener({ scrIds: 'day_gainers', region });
            if (screenRes && screenRes.quotes) {
                return screenRes.quotes
                    .map((q: any) => q.symbol)
                    .filter((s: string) => s && s.endsWith('.JK'));
            }
            return [];
        } catch (error: any) {
            logger.warn(`⚠️ Top Gainers fetch failed for ${region}: ${error.message}`);
            return [];
        }
    }

    /**
     * Fetch real-time quote (current price, volume, etc.)
     */
    async fetchRealTimeQuote(symbol: string): Promise<{
        price: number;
        open: number;
        high: number;
        low: number;
        volume: number;
        previousClose: number;
        changePercent: number;
        marketCap: number;
        name: string;
    } | null> {
        try {
            const result = await yahoo.quote(symbol) as any;

            if (!result) return null;

            return {
                price: result.regularMarketPrice ?? 0,
                open: result.regularMarketOpen ?? 0,
                high: result.regularMarketDayHigh ?? 0,
                low: result.regularMarketDayLow ?? 0,
                volume: result.regularMarketVolume ?? 0,
                previousClose: result.regularMarketPreviousClose ?? 0,
                changePercent: result.regularMarketChangePercent ?? 0,
                marketCap: result.marketCap ?? 0,
                name: result.longName ?? result.shortName ?? symbol,
            };
        } catch (error: any) {
            logger.error(`Error fetching real-time quote for ${symbol}: ${error.message}`);
            return null;
        }
    }

    /**
     * Validate if a symbol exists on Yahoo Finance
     */
    async validateSymbol(symbol: string): Promise<boolean> {
        try {
            const result = await yahoo.quote(symbol) as any;
            return !!(result && result.regularMarketPrice);
        } catch {
            return false;
        }
    }

    /**
     * Search for symbols on Yahoo Finance
     */
    async searchSymbol(query: string): Promise<Array<{ symbol: string; name: string; exchange: string }>> {
        try {
            const result = await yahoo.search(query) as any;
            if (!result || !result.quotes) return [];
            return result.quotes.slice(0, 5).map((q: any) => ({
                symbol: q.symbol,
                name: q.longname ?? q.shortname ?? q.symbol,
                exchange: q.exchange ?? '?',
            }));
        } catch (error: any) {
            logger.error(`Error searching symbol ${query}: ${error.message}`);
            return [];
        }
    }

    /**
     * Fetch Top Active symbols for a specific region using a hybrid approach
     */
    async fetchTopActiveSymbols(region: string = 'ID'): Promise<string[] | any> {
        try {
            logger.info(`📡 Discovering IDX tickers (Hybrid Mode)...`);

            // 1. Core Universe (Liquid IDX Stocks - LQ45 + Mid-Caps)
            // This ensures we always have a high-quality base list.
            const coreUniverse = [
                'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK', 'ASII.JK', 'TLKM.JK', 'UNTR.JK', 'ICBP.JK', 'INDF.JK',
                'KLBF.JK', 'ADRO.JK', 'ITMG.JK', 'PTBA.JK', 'ANTM.JK', 'INCO.JK', 'TPIA.JK', 'BRPT.JK', 'AMRT.JK',
                'UNVR.JK', 'GOTO.JK', 'ARTO.JK', 'MDKA.JK', 'CPIN.JK', 'JPFA.JK', 'KLBF.JK', 'INKP.JK', 'TKIM.JK',
                'SMGR.JK', 'INTP.JK', 'PGAS.JK', 'JSMR.JK', 'AKRA.JK', 'HRUM.JK', 'MEDC.JK', 'ACES.JK', 'MAPI.JK',
                'CTRA.JK', 'BSDE.JK', 'PWON.JK', 'SMRA.JK', 'AUTO.JK', 'GJTL.JK', 'MYOR.JK', 'HMSP.JK', 'GGRM.JK',
                'ERAA.JK', 'SCMA.JK', 'EMTK.JK', 'BUKA.JK', 'BELI.JK', 'ESSA.JK', 'MBMA.JK', 'NCEK.JK', 'CUAN.JK',
                'BREN.JK', 'DSSA.JK', 'GEMS.JK', 'BRMS.JK', 'MAPA.JK', 'AVIA.JK', 'CMRY.JK', 'PANI.JK', 'FILM.JK',
                'SIDO.JK', 'TOWR.JK', 'TBIG.JK', 'MTEL.JK', 'MAPA.JK', 'MTEK.JK', 'PTMP.JK', 'HEAL.JK', 'MIKA.JK'
            ];

            // 2. Dynamic Discovery: Trending Symbols
            let trendingSymbols: string[] = [];
            try {
                const trendingRes = await (yahoo as any).trendingSymbols(region);
                if (trendingRes && trendingRes.quotes) {
                    trendingSymbols = trendingRes.quotes
                        .map((q: any) => q.symbol)
                        .filter((s: string) => s && s.endsWith('.JK'));
                    logger.info(`🔥 Found ${trendingSymbols.length} trending symbols in ${region}`);
                }
            } catch (err) {
                logger.warn(`⚠️ Trending symbols fetch failed: ${err}`);
            }

            // 3. Dynamic Discovery: Screener (Fallback/Additional)
            let screenerSymbols: string[] = [];
            try {
                const screenRes = await (yahoo as any).screener({ scrIds: 'most_actives', region });
                if (screenRes && screenRes.quotes) {
                    // Filter specifically for .JK if screener returns US stocks erroneously
                    screenerSymbols = screenRes.quotes
                        .map((q: any) => q.symbol)
                        .filter((s: string) => s && s.endsWith('.JK'));
                }
            } catch (err) {
                // Ignore screener errors
            }

            // Merge & Unique
            const combined = [...new Set([...coreUniverse, ...trendingSymbols, ...screenerSymbols])];
            logger.info(`✅ Hybrid Discovery complete: ${combined.length} tickers found (${coreUniverse.length} core, ${trendingSymbols.length} trending, ${screenerSymbols.length} screener)`);

            return combined;
        } catch (error: any) {
            logger.error(`Error in hybrid ticker discovery: ${error.message}`);
            return []; // Fallback to empty if everything fails
        }
    }
}
