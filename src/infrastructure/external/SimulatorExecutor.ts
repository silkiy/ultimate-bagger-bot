import { IExecutor, ExecutionRequest, ExecutionResult } from '../../core/domain/interfaces/IExecution';
import { logger } from '../logging/WinstonLogger';

export class SimulatorExecutor implements IExecutor {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
        // Simulated Slippage: 0.1% to 0.3%
        const slippagePct = (Math.random() * (0.003 - 0.001) + 0.001);
        const slippageAmount = request.price * slippagePct;

        // Slippage adds to cost on BUY, subtracts from proceeds on SELL
        const executedPrice = request.type === 'BUY'
            ? request.price + slippageAmount
            : request.price - slippageAmount;

        logger.info(`[Simulator] Executed ${request.type} ${request.symbol} @ ${executedPrice.toFixed(2)} (Slippage: ${(slippagePct * 100).toFixed(3)}%)`);

        return {
            success: true,
            executedPrice,
            slippage: slippageAmount,
            timestamp: new Date()
        };
    }
}
