import { connectDatabase } from './infrastructure/config/database';
import { MongoTickerRepository } from './infrastructure/persistence/TickerRepository';
import { MongoUserRepository } from './infrastructure/persistence/UserRepository';
import { YahooFinanceProvider } from './infrastructure/external/YahooFinanceProvider';
import { TelegramService } from './infrastructure/external/TelegramService';
import { SimulatorExecutor } from './infrastructure/external/SimulatorExecutor';
import { UltimateBaggerV7Strategy } from './core/domain/logic/UltimateBaggerV7Strategy';
import { RunScanner } from './application/use-cases/RunScanner';
import { ExecuteBacktest } from './application/use-cases/ExecuteBacktest';
import { PerformManualAnalysis } from './application/use-cases/PerformManualAnalysis';
import { HandleTradingDecision } from './application/use-cases/HandleTradingDecision';
import { TelegramInterface } from './presentation/bot/TelegramInterface';
import { logger } from './infrastructure/logging/WinstonLogger';

let initialized = false;

// Container for injected dependencies
export interface AppContainer {
    runScanner: RunScanner;
    executeBacktest: ExecuteBacktest;
    manualAnalysis: PerformManualAnalysis;
    handleDecision: HandleTradingDecision;
    tickerRepo: MongoTickerRepository;
    userRepo: MongoUserRepository;
    marketData: YahooFinanceProvider;
    messaging: TelegramService;
    telegramInterface: TelegramInterface;
}

let container: AppContainer;

export async function bootstrap(): Promise<AppContainer> {
    if (initialized) return container;

    logger.info('🏛️ Bootstrapping Institutional Hybrid Quant Engine (Serverless Mode)');

    await connectDatabase();

    const tickerRepo = new MongoTickerRepository();
    const userRepo = new MongoUserRepository();
    const marketData = new YahooFinanceProvider();
    const messaging = new TelegramService(userRepo);
    const simulator = new SimulatorExecutor();
    const strategy = new UltimateBaggerV7Strategy();

    const runScanner = new RunScanner(tickerRepo, marketData, strategy, messaging);
    const executeBacktest = new ExecuteBacktest(marketData, strategy);
    const manualAnalysis = new PerformManualAnalysis(tickerRepo, marketData, strategy);
    const handleDecision = new HandleTradingDecision(tickerRepo, simulator, messaging);

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

    // Initialize but don't start polling (since we'll use webhooks)
    telegramInterface.init();

    container = {
        runScanner,
        executeBacktest,
        manualAnalysis,
        handleDecision,
        tickerRepo,
        userRepo,
        marketData,
        messaging,
        telegramInterface
    };

    initialized = true;
    return container;
}
