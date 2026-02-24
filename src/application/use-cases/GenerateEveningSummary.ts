import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { CalculateHotlist } from './CalculateHotlist';
import { TrackSmartMoney } from './TrackSmartMoney';
import { AnalyzeSectorRotation } from './AnalyzeSectorRotation';
import { logger } from '../../infrastructure/logging/WinstonLogger';
import { DomainMath } from '../../core/domain/logic/Math';

export class GenerateEveningSummary {
    constructor(
        private marketData: IMarketDataProvider,
        private hotlist: CalculateHotlist,
        private smartMoney: TrackSmartMoney,
        private sectorRotation: AnalyzeSectorRotation
    ) { }

    async execute(): Promise<string> {
        logger.info('🌚 Generating Evening Market Pulse Summary...');
        const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

        try {
            // 1. Fetch IHSG (^JKSE) Performance
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 5); // Fetch enough logic
            const jkseData = await this.marketData.fetchHistoricalData('^JKSE', startDate);

            let ihsgMsg = '';
            if (jkseData.length >= 2) {
                const current = jkseData[jkseData.length - 1].close;
                const prev = jkseData[jkseData.length - 2].close;
                const change = ((current - prev) / prev) * 100;
                const changeEmoji = change >= 0 ? '🟢' : '🔴';
                ihsgMsg = `${changeEmoji} <b>IHSG: ${current.toFixed(2)}</b> (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)\n`;
            }

            // 2. Fetch Aggregated Data
            const [hotItems, smartItems, sectorItems] = await Promise.all([
                this.hotlist.execute(),
                this.smartMoney.execute(),
                this.sectorRotation.execute()
            ]);

            // 3. Format Message
            let msg = `🌚 <b>IDX EVENING PULSE</b> (19:00 WIB)\n`;
            msg += `🕒 ${now}\n\n`;

            msg += `📊 <b>Performa Indeks:</b>\n`;
            msg += ihsgMsg || '⚠️ Data IHSG tidak tersedia.\n';
            msg += `\n`;

            // 4. Hotlist (Fast Money)
            if (hotItems.length > 0) {
                msg += `⚡ <b>HOTLIST (Volume Spike):</b>\n`;
                hotItems.slice(0, 3).forEach(item => {
                    const sym = item.symbol.replace('.JK', '');
                    msg += `• <code>${sym}</code> (Vol: ${item.volumeSurge.toFixed(1)}x)\n`;
                });
                msg += `\n`;
            }

            // 5. Smart Money (Quiet Accumulation)
            const accumulating = smartItems.filter(s => s.isAccumulating);
            if (accumulating.length > 0) {
                msg += `🤫 <b>QUIET ACCUMULATION:</b>\n`;
                accumulating.slice(0, 3).forEach(item => {
                    const sym = item.symbol.replace('.JK', '');
                    msg += `• <code>${sym}</code> (Smart Score: ${item.intensity})\n`;
                });
                msg += `\n`;
            }

            // 6. Sector Wisdom
            if (sectorItems.length > 0) {
                msg += `🧭 <b>SECTOR ROTATION (Leading):</b>\n`;
                sectorItems.slice(0, 2).forEach(s => {
                    const trendEmoji = s.momentum === 'BULLISH' ? '📈' : '↔️';
                    msg += `• ${s.name}: <b>${s.momentum}</b> ${trendEmoji}\n`;
                });
            }

            msg += `\n<i>Gunakan /scan atau /smart untuk detail lengkap besok pagi. Salam Bagger!</i>`;

            return msg;
        } catch (error: any) {
            logger.error(`Error generating evening summary: ${error.message}`);
            return `❌ <b>Gagal membuat rangkuman pasar malam ini:</b> ${error.message}`;
        }
    }
}
