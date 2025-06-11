import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';

const logger = createLogger('MetricsCollector');

export interface Metrics {
    // Counters
    totalRewardCycles: number;
    totalTokenUpdates: number;
    totalErrors: number;
    totalTransactions: number;
    
    // Gauges
    currentRewardToken: string | null;
    lastRewardAmount: number;
    lastRecipientCount: number;
    gasUsedTotal: number;
    
    // Histograms
    rewardCycleDurations: number[];
    transactionFees: number[];
    apiResponseTimes: Map<string, number[]>;
    
    // Timestamps
    lastRewardCycle: Date | null;
    lastTokenUpdate: Date | null;
    lastError: Date | null;
}

export interface MetricEvent {
    type: 'reward_cycle' | 'token_update' | 'error' | 'transaction' | 'api_call';
    timestamp: Date;
    data: any;
}

export class MetricsCollector extends EventEmitter {
    private metrics: Metrics;
    private startTime: Date;
    
    constructor() {
        super();
        this.startTime = new Date();
        this.metrics = {
            totalRewardCycles: 0,
            totalTokenUpdates: 0,
            totalErrors: 0,
            totalTransactions: 0,
            currentRewardToken: null,
            lastRewardAmount: 0,
            lastRecipientCount: 0,
            gasUsedTotal: 0,
            rewardCycleDurations: [],
            transactionFees: [],
            apiResponseTimes: new Map(),
            lastRewardCycle: null,
            lastTokenUpdate: null,
            lastError: null,
        };
    }
    
    recordRewardCycle(data: {
        duration: number;
        rewardToken: string;
        amount: number;
        recipients: number;
        gasUsed: number;
    }): void {
        this.metrics.totalRewardCycles++;
        this.metrics.lastRewardCycle = new Date();
        this.metrics.currentRewardToken = data.rewardToken;
        this.metrics.lastRewardAmount = data.amount;
        this.metrics.lastRecipientCount = data.recipients;
        this.metrics.gasUsedTotal += data.gasUsed;
        
        // Keep last 100 durations
        this.metrics.rewardCycleDurations.push(data.duration);
        if (this.metrics.rewardCycleDurations.length > 100) {
            this.metrics.rewardCycleDurations.shift();
        }
        
        this.emit('metric', {
            type: 'reward_cycle',
            timestamp: new Date(),
            data,
        });
        
        logger.info({ data }, 'Recorded reward cycle metrics');
    }
    
    recordTokenUpdate(data: {
        oldToken: string;
        newToken: string;
        symbol: string;
    }): void {
        this.metrics.totalTokenUpdates++;
        this.metrics.lastTokenUpdate = new Date();
        this.metrics.currentRewardToken = data.newToken;
        
        this.emit('metric', {
            type: 'token_update',
            timestamp: new Date(),
            data,
        });
        
        logger.info({ data }, 'Recorded token update');
    }
    
    recordError(error: Error, context?: any): void {
        this.metrics.totalErrors++;
        this.metrics.lastError = new Date();
        
        this.emit('metric', {
            type: 'error',
            timestamp: new Date(),
            data: {
                error: error.message,
                stack: error.stack,
                context,
            },
        });
        
        logger.error({ error, context }, 'Recorded error');
    }
    
    recordTransaction(data: {
        txid: string;
        fee: number;
        type: string;
    }): void {
        this.metrics.totalTransactions++;
        
        // Keep last 100 fees
        this.metrics.transactionFees.push(data.fee);
        if (this.metrics.transactionFees.length > 100) {
            this.metrics.transactionFees.shift();
        }
        
        this.emit('metric', {
            type: 'transaction',
            timestamp: new Date(),
            data,
        });
        
        logger.debug({ data }, 'Recorded transaction');
    }
    
    recordApiCall(endpoint: string, responseTime: number): void {
        if (!this.metrics.apiResponseTimes.has(endpoint)) {
            this.metrics.apiResponseTimes.set(endpoint, []);
        }
        
        const times = this.metrics.apiResponseTimes.get(endpoint)!;
        times.push(responseTime);
        
        // Keep last 100 response times per endpoint
        if (times.length > 100) {
            times.shift();
        }
        
        this.emit('metric', {
            type: 'api_call',
            timestamp: new Date(),
            data: {
                endpoint,
                responseTime,
            },
        });
    }
    
    getMetrics(): Metrics {
        return { ...this.metrics };
    }
    
    getSummary(): any {
        const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
        
        return {
            uptime,
            totals: {
                rewardCycles: this.metrics.totalRewardCycles,
                tokenUpdates: this.metrics.totalTokenUpdates,
                errors: this.metrics.totalErrors,
                transactions: this.metrics.totalTransactions,
                gasUsed: this.metrics.gasUsedTotal,
            },
            current: {
                rewardToken: this.metrics.currentRewardToken,
                lastRewardAmount: this.metrics.lastRewardAmount,
                lastRecipientCount: this.metrics.lastRecipientCount,
            },
            averages: {
                rewardCycleDuration: this.calculateAverage(this.metrics.rewardCycleDurations),
                transactionFee: this.calculateAverage(this.metrics.transactionFees),
                apiResponseTimes: this.getApiResponseAverages(),
            },
            timestamps: {
                lastRewardCycle: this.metrics.lastRewardCycle,
                lastTokenUpdate: this.metrics.lastTokenUpdate,
                lastError: this.metrics.lastError,
            },
        };
    }
    
    private calculateAverage(values: number[]): number {
        if (values.length === 0) return 0;
        const sum = values.reduce((a, b) => a + b, 0);
        return sum / values.length;
    }
    
    private getApiResponseAverages(): Record<string, number> {
        const averages: Record<string, number> = {};
        
        this.metrics.apiResponseTimes.forEach((times, endpoint) => {
            averages[endpoint] = this.calculateAverage(times);
        });
        
        return averages;
    }
    
    reset(): void {
        logger.info('Resetting metrics');
        
        this.metrics = {
            totalRewardCycles: 0,
            totalTokenUpdates: 0,
            totalErrors: 0,
            totalTransactions: 0,
            currentRewardToken: this.metrics.currentRewardToken, // Keep current token
            lastRewardAmount: 0,
            lastRecipientCount: 0,
            gasUsedTotal: 0,
            rewardCycleDurations: [],
            transactionFees: [],
            apiResponseTimes: new Map(),
            lastRewardCycle: null,
            lastTokenUpdate: null,
            lastError: null,
        };
    }
}