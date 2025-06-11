import express from 'express';
import { Router } from 'express';
import { createLogger } from '../utils/logger';
import { RewardScheduler } from '../orchestration/RewardScheduler';
import { config } from '../config';

const logger = createLogger('manual-controls');

export function createTestRouter(scheduler: RewardScheduler): Router {
    const router = Router();
    
    // Only enable in test/development mode
    if (config.NODE_ENV === 'production') {
        router.use((req, res) => {
            res.status(404).json({ error: 'Test endpoints not available in production' });
        });
        return router;
    }
    
    // Manual trigger endpoints
    router.post('/trigger-reward-check', async (req, res) => {
        try {
            logger.info('Manual reward check triggered');
            await scheduler.triggerRewardCheck();
            res.json({ success: true, message: 'Reward check triggered' });
        } catch (error) {
            logger.error({ error }, 'Failed to trigger reward check');
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    router.post('/trigger-distribution', async (req, res) => {
        try {
            logger.info('Manual distribution triggered');
            await scheduler.triggerDistribution();
            res.json({ success: true, message: 'Distribution triggered' });
        } catch (error) {
            logger.error({ error }, 'Failed to trigger distribution');
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    router.post('/update-holders', async (req, res) => {
        try {
            logger.info('Manual holder update triggered');
            await scheduler.triggerHolderUpdate();
            res.json({ success: true, message: 'Holder update triggered' });
        } catch (error) {
            logger.error({ error }, 'Failed to update holders');
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // State inspection endpoints
    router.get('/state', (req, res) => {
        const state = scheduler.getState();
        res.json(state);
    });
    
    router.get('/last-distribution', (req, res) => {
        // This would be implemented with actual distribution history
        res.json({
            message: 'Last distribution info would be here',
            placeholder: true
        });
    });
    
    // Test configuration endpoints
    router.post('/set-reward-token', async (req, res) => {
        const { token, mint } = req.body;
        
        if (!token || !mint) {
            return res.status(400).json({ 
                success: false, 
                error: 'Token symbol and mint address required' 
            });
        }
        
        try {
            logger.info({ token, mint }, 'Manual reward token update');
            // This would update the Smart Dial program
            res.json({ 
                success: true, 
                message: 'Reward token update triggered',
                token,
                mint 
            });
        } catch (error) {
            logger.error({ error }, 'Failed to set reward token');
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // Scheduler control
    router.post('/scheduler/stop', (req, res) => {
        scheduler.stop();
        res.json({ success: true, message: 'Scheduler stopped' });
    });
    
    router.post('/scheduler/start', (req, res) => {
        scheduler.start();
        res.json({ success: true, message: 'Scheduler started' });
    });
    
    return router;
}

// Standalone test server for development
if (require.main === module) {
    const app = express();
    app.use(express.json());
    
    // Mock scheduler for standalone testing
    const mockScheduler = {
        triggerRewardCheck: async () => logger.info('Mock: Reward check'),
        triggerDistribution: async () => logger.info('Mock: Distribution'),
        triggerHolderUpdate: async () => logger.info('Mock: Holder update'),
        getState: () => ({ mock: true, isRunning: true }),
        start: () => logger.info('Mock: Scheduler started'),
        stop: () => logger.info('Mock: Scheduler stopped'),
    } as any;
    
    app.use('/test', createTestRouter(mockScheduler));
    
    const port = 3001;
    app.listen(port, () => {
        logger.info({ port }, 'Test control server started');
    });
}