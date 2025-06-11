import * as cron from 'node-cron';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { RewardOrchestrator } from './RewardOrchestrator';

const logger = createLogger('RewardScheduler');

export interface SchedulerState {
    isRunning: boolean;
    lastRewardCheck: Date | null;
    lastRewardDistribution: Date | null;
    lastHolderUpdate: Date | null;
    totalRewardCycles: number;
    totalErrors: number;
}

export class RewardScheduler {
    private rewardOrchestrator: RewardOrchestrator;
    private tasks: Map<string, cron.ScheduledTask>;
    private state: SchedulerState;
    
    constructor() {
        this.rewardOrchestrator = new RewardOrchestrator();
        this.tasks = new Map();
        this.state = {
            isRunning: false,
            lastRewardCheck: null,
            lastRewardDistribution: null,
            lastHolderUpdate: null,
            totalRewardCycles: 0,
            totalErrors: 0,
        };
    }
    
    start(): void {
        if (this.state.isRunning) {
            logger.warn('Scheduler is already running');
            return;
        }
        
        logger.info('Starting reward scheduler');
        
        // Schedule reward token check (every 30 minutes)
        const rewardCheckInterval = this.msToMinutes(config.REWARD_CHECK_INTERVAL_MS);
        const rewardCheckTask = cron.schedule(`*/${rewardCheckInterval} * * * *`, async () => {
            await this.checkRewardToken();
        });
        this.tasks.set('rewardCheck', rewardCheckTask);
        
        // Schedule reward distribution (every 5 minutes)
        const distributionInterval = this.msToMinutes(config.REWARD_DISTRIBUTION_INTERVAL_MS);
        const distributionTask = cron.schedule(`*/${distributionInterval} * * * *`, async () => {
            await this.distributeRewards();
        });
        this.tasks.set('distribution', distributionTask);
        
        // Schedule holder update (every hour)
        const holderUpdateInterval = this.msToMinutes(config.HOLDER_UPDATE_INTERVAL_MS);
        const holderUpdateTask = cron.schedule(`0 */${holderUpdateInterval} * * *`, async () => {
            await this.updateHolders();
        });
        this.tasks.set('holderUpdate', holderUpdateTask);
        
        // Start all tasks
        this.tasks.forEach(task => task.start());
        
        this.state.isRunning = true;
        
        logger.info({
            rewardCheckInterval: `${rewardCheckInterval} minutes`,
            distributionInterval: `${distributionInterval} minutes`,
            holderUpdateInterval: `${holderUpdateInterval} minutes`,
        }, 'Scheduler started successfully');
        
        // Run initial checks
        this.runInitialChecks();
    }
    
    stop(): void {
        if (!this.state.isRunning) {
            logger.warn('Scheduler is not running');
            return;
        }
        
        logger.info('Stopping reward scheduler');
        
        // Stop all tasks
        this.tasks.forEach(task => task.stop());
        this.tasks.clear();
        
        this.state.isRunning = false;
        
        logger.info('Scheduler stopped successfully');
    }
    
    getState(): SchedulerState {
        return { ...this.state };
    }
    
    private msToMinutes(ms: number): number {
        return Math.floor(ms / 60000);
    }
    
    private async runInitialChecks(): Promise<void> {
        logger.info('Running initial checks');
        
        // Check for new reward token
        await this.checkRewardToken();
        
        // Update holders
        await this.updateHolders();
        
        // Run distribution if conditions are met
        await this.distributeRewards();
    }
    
    private async checkRewardToken(): Promise<void> {
        try {
            logger.info('Checking for new reward token');
            
            await this.rewardOrchestrator.checkAndUpdateRewardToken();
            
            this.state.lastRewardCheck = new Date();
            
            logger.info('Reward token check completed');
        } catch (error) {
            this.state.totalErrors++;
            logger.error({ error }, 'Failed to check reward token');
        }
    }
    
    private async distributeRewards(): Promise<void> {
        try {
            logger.info('Starting reward distribution');
            
            const result = await this.rewardOrchestrator.executeRewardCycle();
            
            if (result.success) {
                this.state.totalRewardCycles++;
                this.state.lastRewardDistribution = new Date();
                
                logger.info({
                    rewardToken: result.rewardToken,
                    amountDistributed: result.amountDistributed,
                    recipientsCount: result.recipientsCount,
                    totalCycles: this.state.totalRewardCycles,
                }, 'Reward distribution completed successfully');
            } else {
                logger.warn({ error: result.error }, 'Reward distribution failed');
            }
            
        } catch (error) {
            this.state.totalErrors++;
            logger.error({ error }, 'Failed to distribute rewards');
        }
    }
    
    private async updateHolders(): Promise<void> {
        try {
            logger.info('Updating holder registry');
            
            // This would be implemented to update all holder registry chunks
            // For now, it's handled as part of the reward cycle
            
            this.state.lastHolderUpdate = new Date();
            
            logger.info('Holder registry update completed');
        } catch (error) {
            this.state.totalErrors++;
            logger.error({ error }, 'Failed to update holders');
        }
    }
    
    // Manual trigger methods for testing
    async triggerRewardCheck(): Promise<void> {
        logger.info('Manually triggering reward check');
        await this.checkRewardToken();
    }
    
    async triggerDistribution(): Promise<void> {
        logger.info('Manually triggering reward distribution');
        await this.distributeRewards();
    }
    
    async triggerHolderUpdate(): Promise<void> {
        logger.info('Manually triggering holder update');
        await this.updateHolders();
    }
}