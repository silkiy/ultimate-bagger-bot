import { ENV } from './infrastructure/config/env';
import { logger } from './infrastructure/logging/WinstonLogger';
import { connectDatabase } from './infrastructure/config/database';

// Repositories
import { MongoTickerRepository } from './infrastructure/persistence/TickerRepository';
import { MongoUserRepository } from './infrastructure/persistence/UserRepository';

// Services
import { YahooFinanceProvider } from './infrastructure/external/YahooFinanceProvider';
import { TelegramService } from './infrastructure/external/TelegramService';
import { SimulatorExecutor } from './infrastructure/external/SimulatorExecutor';

// Logic
import { UltimateBaggerV7Strategy } from './core/domain/logic/UltimateBaggerV7Strategy';

// Use Cases
import { RunScanner } from './application/use-cases/RunScanner';
import { ExecuteBacktest } from './application/use-cases/ExecuteBacktest';
import { PerformManualAnalysis } from './application/use-cases/PerformManualAnalysis';
import { HandleTradingDecision } from './application/use-cases/HandleTradingDecision';

// Presentation
import { QuantController } from './presentation/api/QuantController';
import { bootstrapApi } from './presentation/api/server';
import { TelegramInterface } from './presentation/bot/TelegramInterface';
import { Scheduler } from './infrastructure/config/Scheduler';

async function main() {
    logger.info('🏛️ Initializing Institutional Hybrid Quant Engine');

    // 1. Connectivity
    await connectDatabase();

    // 2. Dependency Injection
    const tickerRepo = new MongoTickerRepository();
    const userRepo = new MongoUserRepository();
    const marketData = new YahooFinanceProvider();
    const messaging = new TelegramService(userRepo);
    const simulator = new SimulatorExecutor();
    const strategy = new UltimateBaggerV7Strategy();

    // 3. Use Case Initialization
    const runScanner = new RunScanner(tickerRepo, marketData, strategy, messaging);
    const executeBacktest = new ExecuteBacktest(marketData, strategy);
    const manualAnalysis = new PerformManualAnalysis(tickerRepo, marketData, strategy);
    const handleDecision = new HandleTradingDecision(tickerRepo, simulator, messaging);

    // 4. API & Interface Initialization
    const quantController = new QuantController(runScanner, executeBacktest, tickerRepo);
    bootstrapApi(quantController);

    // 5. Telegram Interaction Initialization
    const telegramBot = messaging.getBotInstance();
    const telegramInterface = new TelegramInterface(
        telegramBot,
        runScanner,
        executeBacktest,
        manualAnalysis,
        handleDecision,
        tickerRepo,
        userRepo,
        marketData
    );
    telegramInterface.init();

    // Only launch polling if explicitly requested (prevents cloud webhook reset)
    if (process.env.USE_POLLING === 'true') {
        await telegramInterface.launch();
    } else {
        logger.info('ℹ️ Polling mode disabled (Set USE_POLLING=true to enable)');
    }

    // 6. Scheduler
    const scheduler = new Scheduler(runScanner, messaging);
    scheduler.setup();

    logger.info('🚀 Hybrid Engine is fully operational (Semi-Auto Mode Enabled)');
}

main().catch(err => {
    logger.error('CRITICAL INITIALIZATION FAILURE:', err);
    process.exit(1);
});

// Graceful Shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    process.exit(0);
});
