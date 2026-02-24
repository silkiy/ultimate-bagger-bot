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
import { CalculateHotlist } from './application/use-cases/CalculateHotlist';
import { TrackSmartMoney } from './application/use-cases/TrackSmartMoney';
import { AnalyzeSectorRotation } from './application/use-cases/AnalyzeSectorRotation';
import { GenerateEveningSummary } from './application/use-cases/GenerateEveningSummary';
import { AnalyzeSystemicRisk } from './application/use-cases/AnalyzeSystemicRisk';
import { AuditFundamentalHealth } from './application/use-cases/AuditFundamentalHealth';
import { AnalyzeSentiment } from './application/use-cases/AnalyzeSentiment';
import { ScanPersonalWatchlist } from './application/use-cases/ScanPersonalWatchlist';
import { WatchlistSentinel } from './application/use-cases/WatchlistSentinel';
import { TelegramInterface } from './presentation/bot/TelegramInterface';
import { logger } from './infrastructure/logging/WinstonLogger';

let initialized = false;

// Container for injected dependencies
export interface AppContainer {
    runScanner: RunScanner;
    executeBacktest: ExecuteBacktest;
    manualAnalysis: PerformManualAnalysis;
    handleDecision: HandleTradingDecision;
    calculateHotlist: CalculateHotlist;
    trackSmartMoney: TrackSmartMoney;
    analyzeSector: AnalyzeSectorRotation;
    analyzeRisk: AnalyzeSystemicRisk;
    auditFundamental: AuditFundamentalHealth;
    analyzeSentiment: AnalyzeSentiment;
    scanPersonalWatchlist: ScanPersonalWatchlist;
    watchlistSentinel: WatchlistSentinel;
    generateEveningSummary: GenerateEveningSummary;
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
        analyzeSentiment
    );

    // Initialize but don't start polling (since we'll use webhooks)
    telegramInterface.init();

    container = {
        runScanner,
        executeBacktest,
        manualAnalysis,
        handleDecision,
        calculateHotlist,
        trackSmartMoney,
        analyzeSector,
        analyzeRisk,
        auditFundamental,
        analyzeSentiment,
        scanPersonalWatchlist,
        watchlistSentinel,
        generateEveningSummary,
        tickerRepo,
        userRepo,
        marketData,
        messaging,
        telegramInterface
    };

    initialized = true;
    return container;
}
