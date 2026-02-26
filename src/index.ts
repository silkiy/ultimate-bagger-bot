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
import { CalculateHotlist } from './application/use-cases/CalculateHotlist';
import { TrackSmartMoney } from './application/use-cases/TrackSmartMoney';
import { AnalyzeSectorRotation } from './application/use-cases/AnalyzeSectorRotation';
import { AnalyzeSystemicRisk } from './application/use-cases/AnalyzeSystemicRisk';
import { AuditFundamentalHealth } from './application/use-cases/AuditFundamentalHealth';
import { AnalyzeSentiment } from './application/use-cases/AnalyzeSentiment';
import { GenerateEveningSummary } from './application/use-cases/GenerateEveningSummary';
import { ScanPersonalWatchlist } from './application/use-cases/ScanPersonalWatchlist';
import { WatchlistSentinel } from './application/use-cases/WatchlistSentinel';
import { ScanWhaleActivity } from './application/use-cases/ScanWhaleActivity';
import { AuditIntrinsicValue } from './application/use-cases/AuditIntrinsicValue';
import { OptimizePortfolio } from './application/use-cases/OptimizePortfolio';

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
    const calculateHotlist = new CalculateHotlist(marketData);
    const trackSmartMoney = new TrackSmartMoney(marketData);
    const analyzeSector = new AnalyzeSectorRotation(marketData);
    const analyzeRisk = new AnalyzeSystemicRisk(tickerRepo, marketData);
    const auditFundamental = new AuditFundamentalHealth(marketData);
    const analyzeSentiment = new AnalyzeSentiment(marketData);
    const generateEveningSummary = new GenerateEveningSummary(
        marketData,
        calculateHotlist,
        trackSmartMoney,
        analyzeSector
    );
    const scanPersonalWatchlist = new ScanPersonalWatchlist(tickerRepo, manualAnalysis);
    const watchlistSentinel = new WatchlistSentinel(userRepo, tickerRepo, marketData, messaging);
    const scanWhale = new ScanWhaleActivity(marketData);
    const auditIntrinsic = new AuditIntrinsicValue(marketData);
    const optimizePortfolio = new OptimizePortfolio(tickerRepo, marketData, strategy);

    // 4. API & Interface Initialization
    const quantController = new QuantController(runScanner, executeBacktest, tickerRepo);
    bootstrapApi(quantController);

    // 6. Scheduler
    const scheduler = new Scheduler(runScanner, messaging, generateEveningSummary, scanPersonalWatchlist, watchlistSentinel, userRepo);
    scheduler.setup();

    // 7. Telegram Interaction Initialization
    const telegramBot = messaging.getBotInstance();
    const telegramInterface = new TelegramInterface(
        telegramBot,
        runScanner,
        executeBacktest,
        manualAnalysis,
        handleDecision,
        tickerRepo,
        userRepo,
        marketData,
        calculateHotlist,
        trackSmartMoney,
        analyzeSector,
        analyzeRisk,
        auditFundamental,
        analyzeSentiment,
        scanWhale,
        auditIntrinsic,
        optimizePortfolio
    );
    telegramInterface.init();

    // Only launch polling if explicitly requested (prevents cloud webhook reset)
    if (process.env.USE_POLLING === 'true') {
        await telegramInterface.launch();
    } else {
        logger.info('ℹ️ Polling mode disabled (Set USE_POLLING=true to enable)');
    }

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
