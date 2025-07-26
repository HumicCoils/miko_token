import { createLogger } from '../utils/logger';
import { Phase4BConfig } from '../config/config';

const logger = createLogger('TwitterMonitor');

export interface TweetResult {
  success: boolean;
  tweetId?: string;
  extractedSymbol?: string;
  error?: string;
}

export class TwitterMonitor {
  private config: Phase4BConfig;
  private launchTimestamp: number | null = null;
  private lastCheckTime: number | null = null;

  constructor(config: Phase4BConfig) {
    this.config = config;
  }

  setLaunchTimestamp(timestamp: number): void {
    this.launchTimestamp = timestamp;
    logger.info(`Launch timestamp set: ${new Date(timestamp * 1000).toISOString()}`);
  }

  isTimeToCheck(): boolean {
    const now = new Date();
    const isMonday = now.getUTCDay() === 1;
    
    if (!isMonday) return false;
    
    const [hour, minute, second] = this.config.timing.monday_check_time.split(':').map(Number);
    const checkTime = new Date(now);
    checkTime.setUTCHours(hour, minute, second, 0);
    
    const timeDiff = Math.abs(now.getTime() - checkTime.getTime());
    return timeDiff < 60000; // Within 1 minute of check time
  }

  async checkPinnedTweet(): Promise<TweetResult> {
    try {
      logger.info('Checking pinned tweet for token symbol');
      
      // TODO: Implement actual Twitter API integration
      // For now, return mock result
      
      this.lastCheckTime = Date.now();
      
      return {
        success: true,
        tweetId: 'mock-tweet-id',
        extractedSymbol: 'SOL', // Mock extracted symbol
      };
    } catch (error) {
      logger.error('Failed to check pinned tweet', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getStatus(): any {
    return {
      launched: this.launchTimestamp !== null,
      lastCheck: this.lastCheckTime ? new Date(this.lastCheckTime).toISOString() : null,
      nextCheck: this.getNextCheckTime(),
      twitterEnabled: false, // TODO: When real Twitter API implemented
    };
  }

  private getNextCheckTime(): string | null {
    const now = new Date();
    const nextMonday = new Date(now);
    
    // Find next Monday
    const daysUntilMonday = (1 - now.getUTCDay() + 7) % 7 || 7;
    nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
    
    // Set check time
    const [hour, minute, second] = this.config.timing.monday_check_time.split(':').map(Number);
    nextMonday.setUTCHours(hour, minute, second, 0);
    
    return nextMonday.toISOString();
  }
}