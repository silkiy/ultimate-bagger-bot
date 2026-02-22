import { ITickerRepository } from '../../core/domain/interfaces/TickerRepository';
import { IExecutor } from '../../core/domain/interfaces/IExecution';
import { IMessagingService } from '../../core/domain/interfaces/ExternalServices';
import { logger } from '../../infrastructure/logging/WinstonLogger';

export interface DecisionPayload {
    symbol: string;
    action: 'BUY' | 'IGNORE';
    price: number;
    lots: number;
    reason: string;
}

export class HandleTradingDecision {
    constructor(
        private tickerRepo: ITickerRepository,
        private executor: IExecutor,
        private messenger: IMessagingService
    ) { }

    async execute(payload: DecisionPayload): Promise<void> {
        logger.info(`🎮 Processing Trading Decision: ${payload.action} ${payload.symbol}`);

        if (payload.action === 'IGNORE') {
            await this.messenger.sendAlert(`ℹ️ Buy Signal for <b>${payload.symbol}</b> was Ignored.`);
            return;
        }

        try {
            const ticker = await this.tickerRepo.findBySymbol(payload.symbol);
            if (!ticker) throw new Error('Ticker not found');

            const result = await this.executor.execute({
                symbol: payload.symbol,
                type: 'BUY',
                price: payload.price,
                lots: payload.lots,
                reason: payload.reason
            });

            if (result.success) {
                // Update Ticker State
                ticker.state.isHolding = true;
                ticker.state.entryPrice = result.executedPrice;
                ticker.state.highestPrice = result.executedPrice;
                ticker.state.lots = payload.lots;

                const cost = payload.lots * 100 * result.executedPrice;
                ticker.account.reservedCash = ticker.account.currentBalance - cost;
                ticker.account.currentBalance = cost; // Current capital tied in position

                await this.tickerRepo.save(ticker);

                // Persistence log
                await this.tickerRepo.logTrade({
                    symbol: payload.symbol,
                    type: 'BUY',
                    price: payload.price,
                    executedPrice: result.executedPrice,
                    lots: payload.lots,
                    totalValue: cost,
                    slippage: result.slippage,
                    reason: payload.reason,
                    timestamp: new Date()
                });

                await this.messenger.sendAlert(`✅ <b>BUY EXECUTED</b>\nStock: ${payload.symbol}\nPrice: ${result.executedPrice.toFixed(2)}\nLots: ${payload.lots}\nSlippage: ${result.slippage.toFixed(4)}`);
            } else {
                await this.messenger.sendAlert(`❌ <b>BUY FAILED</b>\nStock: ${payload.symbol}\nError: ${result.error}`);
            }
        } catch (error) {
            logger.error(`HandleTradingDecision error for ${payload.symbol}:`, error);
            await this.messenger.sendAlert(`⚠️ Error executing buy for ${payload.symbol}. Check logs.`);
        }
    }
}
