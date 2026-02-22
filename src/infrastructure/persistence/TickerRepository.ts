import mongoose from 'mongoose';
import { DomainTicker } from '../../core/domain/entities/Ticker';
import { TradeLog, SignalHistory, EquitySnapshot } from '../../core/domain/entities/Tracking';
import { ITickerRepository } from '../../core/domain/interfaces/TickerRepository';

const TickerSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true, default: 'global' },
    config: {
        symbol: { type: String, required: true },
        tenkanPeriod: { type: Number, default: 8 },
        kijunPeriod: { type: Number, default: 21 },
        spanBPeriod: { type: Number, default: 55 },
        displacement: { type: Number, default: 26 },
        trailPercent: { type: Number, default: 0.10 },
        entryRule: { type: String, default: 'AGGRESSIVE' },
        sizingMode: { type: String, default: 'ALL_IN' },
        riskPerTrade: { type: Number, default: 0.01 },
        useVolEntry: { type: Boolean, default: true },
        useVolExit: { type: Boolean, default: true },
        useExitKijun: { type: Boolean, default: true },
        useTrailing: { type: Boolean, default: true },
        volEntryMult: { type: Number, default: 1.2 },
        volDistMult: { type: Number, default: 1.5 },
        atrMultiplier: { type: Number, default: 2.0 }
    },
    account: {
        initialCapital: { type: Number, default: 10_000_000 },
        currentBalance: { type: Number, default: 10_000_000 },
        reservedCash: { type: Number, default: 0 },
        isCompounding: { type: Boolean, default: true },
        peakEquity: { type: Number, default: 10_000_000 },
        dailyPeakEquity: { type: Number, default: 10_000_000 },
        dailyStartEquity: { type: Number, default: 10_000_000 },
        lockedCapital: { type: Number, default: 0 }
    },
    state: {
        isHolding: { type: Boolean, default: false },
        entryPrice: { type: Number, default: 0 },
        highestPrice: { type: Number, default: 0 },
        lots: { type: Number, default: 0 },
        lastExitPrice: { type: Number, default: 0 },
        consecutiveLosses: { type: Number, default: 0 },
        equityHistory: [{ date: { type: Date, default: Date.now }, equity: { type: Number, default: 0 } }],
        pyramidEntries: { type: Number, default: 0 },
        atrHistory: [{ type: Number }]
    },
    analytics: {
        totalTrades: { type: Number, default: 0 },
        winRate: { type: Number, default: 0 },
        recentTrades: [{ type: Boolean }],
        profitFactor: { type: Number, default: 0 },
        maxDrawdown: { type: Number, default: 0 },
        avgWin: { type: Number, default: 0 },
        avgLoss: { type: Number, default: 0 },
        expectancy: { type: Number, default: 0 }
    },
    risk: {
        maxExposure: { type: Number, default: 0 },
        currentHeat: { type: Number, default: 0 }
    }
}, { timestamps: true });

// Compound index: symbol unique per user
TickerSchema.index({ userId: 1, 'config.symbol': 1 }, { unique: true });

const TradeLogSchema = new mongoose.Schema({
    userId: { type: String, default: 'global' },
    symbol: String, type: String, price: Number, executedPrice: Number,
    lots: Number, totalValue: Number, slippage: Number, reason: String,
    timestamp: { type: Date, default: Date.now }, rMultiple: Number
});

const SignalHistorySchema = new mongoose.Schema({
    userId: { type: String, default: 'global' },
    symbol: String, type: String, price: Number, confidence: Number,
    timestamp: { type: Date, default: Date.now }, metadata: mongoose.Schema.Types.Mixed
});

const EquitySnapshotSchema = new mongoose.Schema({
    userId: { type: String, default: 'global' },
    date: { type: Date, default: Date.now }, totalEquity: Number,
    cash: Number, portfolioValue: Number, drawdown: Number
});

const TickerModel = mongoose.model('InstitutionalTicker', TickerSchema);
const TradeLogModel = mongoose.model('TradeLog', TradeLogSchema);
const SignalHistoryModel = mongoose.model('SignalHistory', SignalHistorySchema);
const EquitySnapshotModel = mongoose.model('EquitySnapshot', EquitySnapshotSchema);

export class MongoTickerRepository implements ITickerRepository {
    async findBySymbol(symbol: string, userId?: string): Promise<DomainTicker | null> {
        const query: any = { 'config.symbol': symbol };
        if (userId) query.userId = userId;
        const doc = await TickerModel.findOne(query);
        if (!doc) return null;
        return doc.toObject() as unknown as DomainTicker;
    }

    async findAll(userId?: string): Promise<DomainTicker[]> {
        const query: any = userId ? { userId } : {};
        const docs = await TickerModel.find(query);
        return docs.map(doc => doc.toObject() as unknown as DomainTicker);
    }

    async save(ticker: DomainTicker, userId?: string): Promise<void> {
        // Strip _id to avoid duplicate key errors on upserts
        const { _id, ...data } = ticker as any;
        const uid = userId || data.userId || 'global';
        await TickerModel.findOneAndUpdate(
            { userId: uid, 'config.symbol': ticker.config.symbol },
            { ...data, userId: uid },
            { upsert: true, returnDocument: 'after' }
        );
    }

    async deleteBySymbol(symbol: string, userId?: string): Promise<void> {
        const query: any = { 'config.symbol': symbol };
        if (userId) query.userId = userId;
        await TickerModel.deleteOne(query);
    }

    async logTrade(log: TradeLog): Promise<void> {
        await new TradeLogModel(log).save();
    }

    async logSignal(signal: SignalHistory): Promise<void> {
        await new SignalHistoryModel(signal).save();
    }

    async saveEquitySnapshot(snapshot: EquitySnapshot): Promise<void> {
        await new EquitySnapshotModel(snapshot).save();
    }

    async getTradeLogs(symbol?: string): Promise<TradeLog[]> {
        const query = symbol ? { symbol } : {};
        const docs = await TradeLogModel.find(query).sort({ timestamp: -1 });
        return docs.map(doc => doc.toObject() as unknown as TradeLog);
    }
}
