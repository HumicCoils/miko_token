import { config, validateConfig } from './config';
import { createLogger } from './utils/logger';
import { RewardScheduler } from './orchestration/RewardScheduler';
import { HealthCheck } from './monitoring/HealthCheck';
import { MetricsCollector } from './monitoring/MetricsCollector';

const logger = createLogger('main');

// Global error handlers
process.on('uncaughtException', (error) => {
    logger.error({ error }, 'Uncaught exception');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'Unhandled rejection');
    process.exit(1);
});

// Graceful shutdown
let scheduler: RewardScheduler | null = null;

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
    logger.info('Received shutdown signal, starting graceful shutdown');
    
    if (scheduler) {
        scheduler.stop();
    }
    
    // Give some time for pending operations
    setTimeout(() => {
        logger.info('Shutdown complete');
        process.exit(0);
    }, 5000);
}

async function main() {
    try {
        logger.info('Starting MIKO Keeper Bot');
        
        // Validate configuration
        validateConfig();
        logger.info('Configuration validated successfully');
        
        // Initialize metrics collector
        const metricsCollector = new MetricsCollector();
        logger.info('Metrics collector initialized');
        
        // Initialize reward scheduler
        scheduler = new RewardScheduler();
        logger.info('Reward scheduler initialized');
        
        // Initialize health check server
        const healthCheck = new HealthCheck(scheduler);
        await healthCheck.start();
        logger.info('Health check server started');
        
        // Start the scheduler
        scheduler.start();
        
        logger.info({
            nodeEnv: config.NODE_ENV,
            rpcUrl: config.RPC_URL,
            healthCheckPort: config.HEALTH_CHECK_PORT,
            metricsPort: config.METRICS_PORT,
            rewardCheckInterval: `${config.REWARD_CHECK_INTERVAL_MS / 60000} minutes`,
            distributionInterval: `${config.REWARD_DISTRIBUTION_INTERVAL_MS / 60000} minutes`,
        }, 'MIKO Keeper Bot started successfully');
        
        // Log metrics periodically
        setInterval(() => {
            const metrics = metricsCollector.getSummary();
            logger.info({ metrics }, 'Current metrics');
        }, 300000); // Every 5 minutes
        
    } catch (error) {
        logger.error({ error }, 'Failed to start keeper bot');
        process.exit(1);
    }
}

// Start the application
main().catch((error) => {
    logger.error({ error }, 'Fatal error in main');
    process.exit(1);
});