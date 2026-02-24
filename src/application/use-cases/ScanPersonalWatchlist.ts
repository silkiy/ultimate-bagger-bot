import { ITickerRepository } from '../../core/domain/interfaces/TickerRepository';
import { PerformManualAnalysis } from './PerformManualAnalysis';
import { logger } from '../../infrastructure/logging/WinstonLogger';

export type ScanSession = 'MIDDAY' | 'CLOSING' | 'EVENING';

interface WatchlistScanResult {
    symbol: string;
    price: number;
    changePercent: string;
    signalType: string;
    confidence: number;
    entry: number;
    sl: number;
    tp1: number;
    tp2: number;
    auditBadge: string;
    sentimentBadge: string;
}

export class ScanPersonalWatchlist {
    constructor(
        private tickerRepo: ITickerRepository,
        private manualAnalysis: PerformManualAnalysis
    ) { }

    async execute(userId: string, session: ScanSession): Promise<string | null> {
        const tickers = await this.tickerRepo.findAll(userId);

        if (!tickers || tickers.length === 0) {
            return null; // User has no watchlist, skip silently
        }

        const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        const sessionLabel = session === 'MIDDAY'
            ? '🕐 Sesi 1 Tutup (12:00)'
            : session === 'CLOSING'
                ? '🕓 Sesi 2 Tutup (16:00)'
                : '🌙 Evening Recon (19:00)';

        let msg = `🏛️ <b>Watchlist Intelligence — ${sessionLabel}</b>\n`;
        msg += `🕒 ${now}\n`;
        msg += `🔍 Scanning <b>${tickers.length} assets</b> in your vault...\n\n`;

        const results: WatchlistScanResult[] = [];
        let buyCount = 0, sellCount = 0, holdCount = 0;

        for (const ticker of tickers) {
            try {
                const signal = await this.manualAnalysis.execute(ticker.config.symbol);
                if (!signal) continue;

                const rt = (signal as any).realTimeData;
                const lv = rt?.tradingLevels;

                const result: WatchlistScanResult = {
                    symbol: ticker.config.symbol,
                    price: signal.price || 0,
                    changePercent: rt?.changePercent || '0',
                    signalType: signal.type || 'HOLD',
                    confidence: signal.confidence?.total || 0,
                    entry: lv?.entry || 0,
                    sl: lv?.sl || 0,
                    tp1: lv?.tp1 || 0,
                    tp2: lv?.tp2 || 0,
                    auditBadge: (signal as any).auditBadge || '',
                    sentimentBadge: (signal as any).sentimentBadge || ''
                };

                results.push(result);
                if (signal.type === 'BUY') buyCount++;
                else if (signal.type === 'SELL') sellCount++;
                else holdCount++;
            } catch (err: any) {
                logger.warn(`Watchlist scan failed for ${ticker.config.symbol}: ${err.message}`);
            }
        }

        if (results.length === 0) {
            return null;
        }

        // Summary counts
        if (buyCount > 0) msg += `✅ BUY: <b>${buyCount}</b>  `;
        if (sellCount > 0) msg += `🔴 SELL: <b>${sellCount}</b>  `;
        msg += `⏸️ HOLD: <b>${holdCount}</b>\n\n`;

        // Per-stock table
        msg += `<code>`;
        msg += `Saham      Harga    Chg%  Sinyal\n`;
        msg += `────────── ──────── ───── ──────\n`;
        for (const r of results) {
            const sym = r.symbol.replace('.JK', '').padEnd(10, ' ');
            const price = r.price.toLocaleString('id-ID').padStart(8, ' ');
            const chg = (parseFloat(r.changePercent) >= 0 ? '+' : '') + parseFloat(r.changePercent).toFixed(1) + '%';
            const chgStr = chg.padStart(5, ' ');
            const sig = r.signalType.padEnd(6, ' ');
            msg += `${sym} ${price} ${chgStr} ${sig}\n`;
        }
        msg += `</code>\n`;

        // Highlight BUY signals with trading levels
        const buys = results.filter(r => r.signalType === 'BUY');
        if (buys.length > 0) {
            msg += `\n🎯 <b>Sinyal BUY Aktif:</b>\n`;
            for (const b of buys) {
                msg += `\n<b>${b.symbol.replace('.JK', '')}</b> @ Rp ${b.price.toLocaleString('id-ID')} ${b.sentimentBadge} ${b.auditBadge}\n`;
                msg += `<code>`;
                msg += `  📍 Entry : Rp ${b.entry.toLocaleString('id-ID')}\n`;
                msg += `  🛑 SL    : Rp ${b.sl.toLocaleString('id-ID')}\n`;
                msg += `  ✅ TP1   : Rp ${b.tp1.toLocaleString('id-ID')}\n`;
                msg += `  ✅ TP2   : Rp ${b.tp2.toLocaleString('id-ID')}\n`;
                msg += `</code>`;
            }
        }

        // Highlight SELL signals
        const sells = results.filter(r => r.signalType === 'SELL');
        if (sells.length > 0) {
            msg += `\n⚠️ <b>Sinyal SELL Aktif:</b>\n`;
            for (const s of sells) {
                msg += `  🔴 <b>${s.symbol.replace('.JK', '')}</b> @ Rp ${s.price.toLocaleString('id-ID')} ${s.sentimentBadge} ${s.auditBadge}\n`;
            }
        }

        msg += `\n💡 <i>Gunakan /analyze [SYM] untuk detail lengkap.</i>`;
        msg += `\n🔙 /back`;

        return msg;
    }
}
