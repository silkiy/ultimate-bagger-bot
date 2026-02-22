export interface ExecutionRequest {
    symbol: string;
    type: 'BUY' | 'SELL';
    price: number;
    lots: number;
    reason: string;
}

export interface ExecutionResult {
    success: boolean;
    executedPrice: number;
    slippage: number;
    timestamp: Date;
    error?: string;
}

export interface IExecutor {
    execute(request: ExecutionRequest): Promise<ExecutionResult>;
}
