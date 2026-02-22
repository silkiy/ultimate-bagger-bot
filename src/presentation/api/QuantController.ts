import { Request, Response } from 'express';
import { RunScanner } from '../../application/use-cases/RunScanner';
import { ExecuteBacktest } from '../../application/use-cases/ExecuteBacktest';
import { ITickerRepository } from '../../core/domain/interfaces/TickerRepository';
import { logger } from '../../infrastructure/logging/WinstonLogger';
import { DomainTicker } from '../../core/domain/entities/Ticker';

export class QuantController {
    constructor(
        private scanner: RunScanner,
        private backtester: ExecuteBacktest,
        private tickerRepo: ITickerRepository
    ) { }

    analyze = async (req: Request, res: Response) => {
        try {
            await this.scanner.execute();
            res.json({ message: 'Analysis completed' });
        } catch (error) {
            logger.error('API Analyze Error:', error);
            res.status(500).json({ error: 'Analysis failed' });
        }
    };

    backtest = async (req: Request, res: Response) => {
        const { symbol } = req.body;
        if (!symbol) return res.status(400).json({ error: 'Symbol is required' });

        try {
            const ticker = await this.tickerRepo.findBySymbol(symbol);
            if (!ticker) return res.status(404).json({ error: 'Ticker not configured' });

            const result = await this.backtester.execute(ticker);
            res.json(result);
        } catch (error) {
            logger.error('API Backtest Error:', error);
            res.status(500).json({ error: 'Backtest failed' });
        }
    };

    getPortfolio = async (req: Request, res: Response) => {
        try {
            const tickers = await this.tickerRepo.findAll();
            const holding = tickers.filter((t: DomainTicker) => t.state.isHolding);
            res.json({
                totalPositions: tickers.length,
                activePositions: holding.length,
                details: holding.map((t: DomainTicker) => ({
                    symbol: t.config.symbol,
                    entry: t.state.entryPrice,
                    highest: t.state.highestPrice,
                    lots: t.state.lots,
                    balance: t.account.currentBalance
                }))
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch portfolio' });
        }
    };
}
