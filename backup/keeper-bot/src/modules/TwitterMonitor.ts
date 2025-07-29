import { TwitterApi } from 'twitter-api-v2';
import { createLogger } from '../utils/logger';
import { Config } from '../config/config';

const logger = createLogger('TwitterMonitor');

export interface TwitterCheckResult {
  success: boolean;
  pinnedTweetFound: boolean;
  extractedSymbol?: string;
  tweetId?: string;
  tweetText?: string;
  error?: string;
}

export class TwitterMonitor {
  private config: Config;
  private twitterClient: TwitterApi | null = null;
  private launchTimestamp: number | null = null;
  private lastCheckTime: number | null = null;

  constructor(config: Config) {
    this.config = config;
    
    if (config.apis.twitter.enabled) {
      this.initializeTwitterClient();
    }
  }

  private initializeTwitterClient(): void {
    try {
      this.twitterClient = new TwitterApi({
        appKey: this.config.apis.twitter.api_key,
        appSecret: this.config.apis.twitter.api_secret,
        accessToken: this.config.apis.twitter.access_token,
        accessSecret: this.config.apis.twitter.access_secret,
      });
      logger.info('Twitter client initialized');
    } catch (error) {
      logger.error('Failed to initialize Twitter client', { error });
    }
  }

  /**
   * Set the launch timestamp
   */
  setLaunchTimestamp(timestamp: number): void {
    this.launchTimestamp = timestamp;
    logger.info(`Launch timestamp set: ${new Date(timestamp * 1000).toISOString()}`);
  }

  /**
   * Calculate the first Monday after launch
   */
  getFirstMondayAfterLaunch(): Date | null {
    if (!this.launchTimestamp) {
      return null;
    }

    const launchDate = new Date(this.launchTimestamp * 1000);
    const firstMonday = new Date(launchDate);
    
    // Get day of week (0 = Sunday, 1 = Monday, etc.)
    const dayOfWeek = launchDate.getUTCDay();
    
    // Calculate days until next Monday
    let daysUntilMonday: number;
    if (dayOfWeek === 1) {
      // If launch is on Monday, first Monday is next week
      daysUntilMonday = 7;
    } else if (dayOfWeek === 0) {
      // If launch is on Sunday, Monday is tomorrow
      daysUntilMonday = 1;
    } else {
      // Otherwise, calculate days until Monday
      daysUntilMonday = (8 - dayOfWeek) % 7;
    }
    
    firstMonday.setUTCDate(launchDate.getUTCDate() + daysUntilMonday);
    firstMonday.setUTCHours(3, 0, 0, 0); // Set to 03:00 UTC
    
    logger.debug(`First Monday after launch: ${firstMonday.toISOString()}`);
    
    return firstMonday;
  }

  /**
   * Check if it's time to check for new reward token
   */
  isTimeToCheck(): boolean {
    const firstMonday = this.getFirstMondayAfterLaunch();
    if (!firstMonday) {
      return false;
    }

    const now = new Date();
    
    // Not yet first Monday
    if (now < firstMonday) {
      return false;
    }

    // Check if it's Monday and around 03:00 UTC
    if (now.getUTCDay() !== 1) {
      return false;
    }

    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    
    // Check if it's between 03:00 and 03:30 UTC
    if (currentHour !== 3 || currentMinute > 30) {
      return false;
    }

    // Don't check more than once per week
    if (this.lastCheckTime) {
      const timeSinceLastCheck = now.getTime() - this.lastCheckTime;
      const sixDays = 6 * 24 * 60 * 60 * 1000;
      if (timeSinceLastCheck < sixDays) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check pinned tweet and extract reward token symbol
   */
  async checkPinnedTweet(): Promise<TwitterCheckResult> {
    try {
      // In mock mode, return test data
      if (!this.config.apis.twitter.enabled || !this.twitterClient) {
        return this.getMockPinnedTweet();
      }

      // TODO: Real Twitter API implementation would:
      // 1. Get user by username
      // 2. Get user's pinned tweet
      // 3. Extract $SYMBOL from tweet text
      // 4. Validate symbol format

      logger.warn('Real Twitter API not implemented in mock phase');
      return this.getMockPinnedTweet();

    } catch (error) {
      logger.error('Failed to check pinned tweet', { error });
      return {
        success: false,
        pinnedTweetFound: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      this.lastCheckTime = Date.now();
    }
  }

  /**
   * Extract token symbol from tweet text
   */
  extractSymbolFromText(text: string): string | null {
    // Match $SYMBOL pattern (1-10 uppercase letters/numbers)
    const symbolMatch = text.match(/\$([A-Z0-9]{1,10})(?:\s|$|[.,!?])/);
    
    if (symbolMatch && symbolMatch[1]) {
      const symbol = symbolMatch[1];
      logger.info(`Extracted symbol from tweet: $${symbol}`);
      return symbol;
    }
    
    logger.warn('No valid symbol found in tweet text');
    return null;
  }

  /**
   * Get mock pinned tweet for testing
   */
  private getMockPinnedTweet(): TwitterCheckResult {
    const mockTweets = [
      {
        id: 'mock-tweet-1',
        text: 'This week\'s reward token is $PEPE! 🐸 Get ready for some meme magic!'
      },
      {
        id: 'mock-tweet-2',
        text: 'Switching rewards to $BONK this Monday! Woof woof! 🐕'
      },
      {
        id: 'mock-tweet-3',
        text: 'Back to basics - $SOL rewards for our holders! ☀️'
      }
    ];

    // Select random mock tweet
    const tweet = mockTweets[Math.floor(Math.random() * mockTweets.length)];
    const symbol = this.extractSymbolFromText(tweet.text);

    logger.info(`[MOCK] Found pinned tweet: ${tweet.text}`);

    return {
      success: true,
      pinnedTweetFound: true,
      extractedSymbol: symbol || undefined,
      tweetId: tweet.id,
      tweetText: tweet.text
    };
  }

  /**
   * Validate if symbol is acceptable
   */
  isValidSymbol(symbol: string): boolean {
    // Must be 1-10 characters
    if (symbol.length < 1 || symbol.length > 10) {
      return false;
    }

    // Must be uppercase alphanumeric only
    if (!/^[A-Z0-9]+$/.test(symbol)) {
      return false;
    }

    return true;
  }

  /**
   * Get current status
   */
  getStatus(): {
    enabled: boolean;
    launched: boolean;
    firstMonday: Date | null;
    isAfterFirstMonday: boolean;
    lastCheckTime: number | null;
    nextCheckTime: Date | null;
  } {
    const firstMonday = this.getFirstMondayAfterLaunch();
    const now = new Date();
    const isAfterFirstMonday = firstMonday ? now >= firstMonday : false;

    let nextCheckTime: Date | null = null;
    if (firstMonday) {
      if (!isAfterFirstMonday) {
        nextCheckTime = firstMonday;
      } else {
        // Calculate next Monday 03:00 UTC
        nextCheckTime = new Date(now);
        const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
        nextCheckTime.setUTCDate(now.getUTCDate() + daysUntilMonday);
        nextCheckTime.setUTCHours(3, 0, 0, 0);
      }
    }

    return {
      enabled: this.config.apis.twitter.enabled,
      launched: this.launchTimestamp !== null,
      firstMonday,
      isAfterFirstMonday,
      lastCheckTime: this.lastCheckTime,
      nextCheckTime
    };
  }

  /**
   * Reset monitor state (for testing)
   */
  reset(): void {
    this.launchTimestamp = null;
    this.lastCheckTime = null;
    logger.info('TwitterMonitor reset');
  }
}