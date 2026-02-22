import express from 'express';
import { ENV } from '../../infrastructure/config/env';
import { logger } from '../../infrastructure/logging/WinstonLogger';
import { QuantController } from './QuantController';

export const bootstrapApi = (controller: QuantController) => {
    const app = express();
    app.use(express.json());

    app.post('/analyze', controller.analyze);
    app.post('/backtest', controller.backtest);
    app.get('/portfolio', controller.getPortfolio);

    app.listen(ENV.PORT, () => {
        logger.info(`🌐 Institutional API running on port ${ENV.PORT}`);
    });

    return app;
};
