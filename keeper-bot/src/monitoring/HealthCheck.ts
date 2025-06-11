import express, { Express, Request, Response } from 'express';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { SolanaClient } from '../services/SolanaClient';
import { RewardScheduler } from '../orchestration/RewardScheduler';

const logger = createLogger('HealthCheck');

export interface HealthStatus {
    status: 'healthy' | 'unhealthy';
    timestamp: string;
    checks: {
        solana: CheckResult;
        scheduler: CheckResult;
        balance: CheckResult;
    };
    details: {
        slot?: number;
        uptime: number;
        lastExecution?: string;
        solBalance?: number;
        mikoBalance?: number;
        schedulerState?: any;
    };
}

interface CheckResult {
    status: 'ok' | 'error';
    message?: string;
}

export class HealthCheck {
    private app: Express;
    private solanaClient: SolanaClient;
    private scheduler: RewardScheduler;
    private startTime: Date;
    
    constructor(scheduler: RewardScheduler) {
        this.app = express();
        this.solanaClient = new SolanaClient();
        this.scheduler = scheduler;
        this.startTime = new Date();
        
        this.setupRoutes();
    }
    
    private setupRoutes(): void {
        // Health check endpoint
        this.app.get('/health', async (req: Request, res: Response) => {
            const health = await this.getHealthStatus();
            const statusCode = health.status === 'healthy' ? 200 : 503;
            res.status(statusCode).json(health);
        });
        
        // Metrics endpoint
        this.app.get('/metrics', async (req: Request, res: Response) => {
            const metrics = await this.getMetrics();
            res.json(metrics);
        });
        
        // Liveness probe
        this.app.get('/live', (req: Request, res: Response) => {
            res.status(200).send('OK');
        });
        
        // Readiness probe
        this.app.get('/ready', async (req: Request, res: Response) => {
            const isReady = await this.checkReadiness();
            res.status(isReady ? 200 : 503).send(isReady ? 'Ready' : 'Not Ready');
        });
    }
    
    async start(): Promise<void> {
        return new Promise((resolve) => {
            this.app.listen(config.HEALTH_CHECK_PORT, () => {
                logger.info({ port: config.HEALTH_CHECK_PORT }, 'Health check server started');
                resolve();
            });
        });
    }
    
    private async getHealthStatus(): Promise<HealthStatus> {
        const checks = {
            solana: await this.checkSolanaConnection(),
            scheduler: this.checkScheduler(),
            balance: await this.checkBalance(),
        };
        
        const isHealthy = Object.values(checks).every(check => check.status === 'ok');
        
        const schedulerState = this.scheduler.getState();
        const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
        
        const health: HealthStatus = {
            status: isHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            checks,
            details: {
                uptime,
                schedulerState,
            },
        };
        
        // Add additional details from checks
        try {
            const solanaHealth = await this.solanaClient.getHealth();
            health.details.slot = solanaHealth.slot;
            
            const solBalance = await this.solanaClient.getBalance();
            health.details.solBalance = solBalance;
            
            const mikoBalance = await this.solanaClient.getTokenBalance(config.MIKO_TOKEN_MINT);
            health.details.mikoBalance = mikoBalance;
            
        } catch (error) {
            logger.warn({ error }, 'Failed to get additional health details');
        }
        
        return health;
    }
    
    private async checkSolanaConnection(): Promise<CheckResult> {
        try {
            const health = await this.solanaClient.getHealth();
            
            if (!health.slot || health.slot === 0) {
                return {
                    status: 'error',
                    message: 'Invalid slot number',
                };
            }
            
            // Check if block time is recent (within 5 minutes)
            if (health.blockTime) {
                const blockAge = Date.now() / 1000 - health.blockTime;
                if (blockAge > 300) {
                    return {
                        status: 'error',
                        message: `Block is ${Math.floor(blockAge)} seconds old`,
                    };
                }
            }
            
            return { status: 'ok' };
        } catch (error) {
            return {
                status: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    
    private checkScheduler(): CheckResult {
        const state = this.scheduler.getState();
        
        if (!state.isRunning) {
            return {
                status: 'error',
                message: 'Scheduler is not running',
            };
        }
        
        // Check if scheduler has been running but not executing
        if (state.lastRewardDistribution) {
            const timeSinceLastDistribution = Date.now() - state.lastRewardDistribution.getTime();
            const maxAcceptableDelay = config.REWARD_DISTRIBUTION_INTERVAL_MS * 2;
            
            if (timeSinceLastDistribution > maxAcceptableDelay) {
                return {
                    status: 'error',
                    message: `No distribution for ${Math.floor(timeSinceLastDistribution / 60000)} minutes`,
                };
            }
        }
        
        return { status: 'ok' };
    }
    
    private async checkBalance(): Promise<CheckResult> {
        try {
            const solBalance = await this.solanaClient.getBalance();
            
            // Minimum SOL balance for operations (0.1 SOL)
            const minSolBalance = 0.1;
            
            if (solBalance < minSolBalance) {
                return {
                    status: 'error',
                    message: `Low SOL balance: ${solBalance} SOL`,
                };
            }
            
            return { status: 'ok' };
        } catch (error) {
            return {
                status: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    
    private async checkReadiness(): Promise<boolean> {
        // Check if all critical components are ready
        const health = await this.getHealthStatus();
        return health.status === 'healthy';
    }
    
    private async getMetrics(): Promise<any> {
        const schedulerState = this.scheduler.getState();
        
        try {
            const solBalance = await this.solanaClient.getBalance();
            const mikoBalance = await this.solanaClient.getTokenBalance(config.MIKO_TOKEN_MINT);
            const slot = await this.solanaClient.getSlot();
            
            return {
                timestamp: new Date().toISOString(),
                uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
                scheduler: {
                    isRunning: schedulerState.isRunning,
                    totalRewardCycles: schedulerState.totalRewardCycles,
                    totalErrors: schedulerState.totalErrors,
                    lastRewardCheck: schedulerState.lastRewardCheck,
                    lastRewardDistribution: schedulerState.lastRewardDistribution,
                    lastHolderUpdate: schedulerState.lastHolderUpdate,
                },
                balances: {
                    sol: solBalance,
                    miko: mikoBalance,
                },
                blockchain: {
                    slot,
                    rpcUrl: config.RPC_URL,
                },
            };
        } catch (error) {
            logger.error({ error }, 'Failed to get metrics');
            return {
                timestamp: new Date().toISOString(),
                error: 'Failed to collect metrics',
            };
        }
    }
}