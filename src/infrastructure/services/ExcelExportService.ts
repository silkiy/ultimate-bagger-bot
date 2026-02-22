import { TradeLog, PerformanceReport } from '../../core/domain/logic/PerformanceAnalytics';
import * as fs from 'fs';
import * as path from 'path';

export class ExcelExportService {
    private static readonly EXPORT_DIR = path.join(process.cwd(), 'research_out');

    static exportToCSV(symbol: string, trades: TradeLog[]): string {
        if (!fs.existsSync(this.EXPORT_DIR)) fs.mkdirSync(this.EXPORT_DIR);

        const filePath = path.join(this.EXPORT_DIR, `${symbol}_trades_${Date.now()}.csv`);
        const header = 'Timestamp,Symbol,Type,Price,Lots,Value,Reason\n';
        const rows = trades.map(t =>
            `${t.timestamp},${t.symbol},${t.type},${t.executedPrice},${t.lots},${t.totalValue},${t.reason}`
        ).join('\n');

        fs.writeFileSync(filePath, header + rows);
        return filePath;
    }

    static exportSummary(symbol: string, report: PerformanceReport): string {
        if (!fs.existsSync(this.EXPORT_DIR)) fs.mkdirSync(this.EXPORT_DIR);

        const filePath = path.join(this.EXPORT_DIR, `${symbol}_summary_${Date.now()}.json`);
        fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
        return filePath;
    }
}
