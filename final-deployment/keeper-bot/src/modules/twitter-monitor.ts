import { PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { Logger } from '../utils/logger';
import { BirdeyeClient } from '../api/birdeye-client';

interface TwitterConfig {
  check_day: number;
  check_hour: number;
  check_minute: number;
}

interface TwitterApiCredentials {
  bearer_token: string;
  username: string;
}

export class TwitterMonitor {
  private config: any;
  private logger: Logger;
  private birdeyeClient: BirdeyeClient;
  private isRunning: boolean = false;
  private selectedToken: PublicKey | null = null;
  private lastUpdateTime: Date | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private credentials: TwitterApiCredentials;
  
  // Default to SOL
  private readonly SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
  
  constructor(config: any, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.birdeyeClient = new BirdeyeClient(config.birdeye.api_key, logger);
    
    // Load Twitter credentials from environment
    this.credentials = {
      bearer_token: process.env.TWITTER_BEARER_TOKEN || '',
      username: process.env.TWITTER_USERNAME || 'project_miko'
    };
    
    if (!this.credentials.bearer_token) {
      this.logger.warn('Twitter Bearer Token not set. Twitter monitoring will not work.');
    }
    
    // Initialize with SOL as default
    this.selectedToken = this.SOL_MINT;
  }
  
  /**
   * Start monitoring Twitter
   */
  async start() {
    if (this.isRunning) {
      return;
    }
    
    this.logger.info('Starting Twitter monitor', {
      username: this.credentials.username,
      checkDay: this.config.twitter.check_day,
      checkHour: this.config.twitter.check_hour
    });
    
    this.isRunning = true;
    
    // Check every hour if it's time to update
    this.checkInterval = setInterval(() => {
      this.checkForUpdate();
    }, 60 * 60 * 1000); // 1 hour
    
    // Initial check
    await this.checkForUpdate();
  }
  
  /**
   * Stop monitoring
   */
  async stop() {
    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.logger.info('Twitter monitor stopped');
  }
  
  /**
   * Check if reward token should be updated
   */
  async shouldUpdateRewardToken(): Promise<boolean> {
    const now = new Date();
    const twitterConfig = this.config.twitter as TwitterConfig;
    
    // Check if it's the right day and time
    const isUpdateDay = now.getDay() === twitterConfig.check_day; // 1 = Monday
    const isUpdateHour = now.getHours() === twitterConfig.check_hour;
    const isUpdateWindow = now.getMinutes() >= twitterConfig.check_minute && 
                          now.getMinutes() < twitterConfig.check_minute + 30;
    
    if (!isUpdateDay || !isUpdateHour || !isUpdateWindow) {
      return false;
    }
    
    // Check if we already updated this week
    if (this.lastUpdateTime) {
      const daysSinceUpdate = (now.getTime() - this.lastUpdateTime.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 6) {
        return false; // Already updated this week
      }
    }
    
    return true;
  }
  
  /**
   * Get the selected reward token
   */
  async getSelectedToken(): Promise<PublicKey | null> {
    try {
      // Get pinned tweet
      const pinnedTweet = await this.getPinnedTweet();
      if (!pinnedTweet) {
        this.logger.warn('No pinned tweet found');
        return null;
      }
      
      // Extract symbol from tweet
      const symbol = this.extractSymbolFromTweet(pinnedTweet.text);
      if (!symbol) {
        this.logger.warn('No symbol found in pinned tweet', { text: pinnedTweet.text });
        return null;
      }
      
      this.logger.info('Symbol extracted from pinned tweet', { 
        symbol,
        tweetId: pinnedTweet.id,
        createdAt: pinnedTweet.created_at
      });
      
      // Find token with highest 24h volume
      const tokenInfo = await this.birdeyeClient.getTokenBySymbolWithHighestVolume(symbol);
      if (!tokenInfo) {
        this.logger.warn('No token found for symbol', { symbol });
        return null;
      }
      
      this.selectedToken = new PublicKey(tokenInfo.address);
      this.lastUpdateTime = new Date();
      
      this.logger.info('Selected new reward token', {
        symbol: tokenInfo.symbol,
        address: tokenInfo.address,
        volume24h: tokenInfo.volume24h,
        name: tokenInfo.name
      });
      
      return this.selectedToken;
      
    } catch (error) {
      this.logger.error('Failed to get selected token', error);
      return null;
    }
  }
  
  /**
   * Get pinned tweet from Twitter API
   */
  private async getPinnedTweet(): Promise<any> {
    try {
      if (!this.credentials.bearer_token) {
        throw new Error('Twitter Bearer Token not configured');
      }
      
      // Get user data including pinned_tweet_id
      const userResponse = await axios.get(
        `https://api.twitter.com/2/users/by/username/${this.credentials.username}`,
        {
          params: {
            'user.fields': 'pinned_tweet_id'
          },
          headers: {
            'Authorization': `Bearer ${this.credentials.bearer_token}`,
            'User-Agent': 'v2UserLookupJS'
          }
        }
      );
      
      if (!userResponse.data?.data) {
        throw new Error('Failed to get user data');
      }
      
      const userData = userResponse.data.data;
      const pinnedTweetId = userData.pinned_tweet_id;
      
      if (!pinnedTweetId) {
        this.logger.warn('User has no pinned tweet');
        return null;
      }
      
      // Get the pinned tweet by ID
      const tweetResponse = await axios.get(
        `https://api.twitter.com/2/tweets/${pinnedTweetId}`,
        {
          params: {
            'tweet.fields': 'created_at,author_id,public_metrics'
          },
          headers: {
            'Authorization': `Bearer ${this.credentials.bearer_token}`,
            'User-Agent': 'v2TweetLookupJS'
          }
        }
      );
      
      if (!tweetResponse.data?.data) {
        throw new Error('Failed to get pinned tweet');
      }
      
      const pinnedTweet = tweetResponse.data.data;
      
      // Verify it was posted in the expected window (Monday 00:00-02:00 UTC)
      const createdAt = new Date(pinnedTweet.created_at);
      const isMonday = createdAt.getUTCDay() === 1;
      const hour = createdAt.getUTCHours();
      const isCorrectTime = hour >= 0 && hour < 2;
      
      if (!isMonday || !isCorrectTime) {
        this.logger.warn('Pinned tweet not from expected time window', {
          createdAt: pinnedTweet.created_at,
          isMonday,
          hour
        });
      }
      
      return pinnedTweet;
      
    } catch (error: any) {
      this.logger.error('Failed to get pinned tweet', {
        error: error.message,
        response: error.response?.data
      });
      return null;
    }
  }
  
  /**
   * Extract $SYMBOL from tweet text
   */
  private extractSymbolFromTweet(text: string): string | null {
    // Look for $SYMBOL pattern
    const symbolMatch = text.match(/\$([A-Z]+)/);
    
    if (symbolMatch && symbolMatch[1]) {
      return symbolMatch[1];
    }
    
    return null;
  }
  
  /**
   * Check for update opportunities
   */
  private async checkForUpdate() {
    if (!await this.shouldUpdateRewardToken()) {
      return;
    }
    
    this.logger.info('Twitter monitor: Time to check for new reward token');
    
    try {
      const newToken = await this.getSelectedToken();
      if (newToken) {
        this.logger.info('New reward token selected from Twitter', {
          token: newToken.toBase58()
        });
      }
    } catch (error) {
      this.logger.error('Failed to check Twitter for reward token', error);
    }
  }
  
  /**
   * Get current reward token without updating
   */
  getCurrentToken(): PublicKey {
    return this.selectedToken || this.SOL_MINT;
  }
  
  /**
   * Get last update time
   */
  getLastUpdateTime(): Date | null {
    return this.lastUpdateTime;
  }
  
  /**
   * Get next update time
   */
  getNextUpdateTime(): Date {
    const next = new Date();
    const twitterConfig = this.config.twitter as TwitterConfig;
    
    // Set to next Monday at configured time
    const daysUntilMonday = (7 + twitterConfig.check_day - next.getDay()) % 7 || 7;
    next.setDate(next.getDate() + daysUntilMonday);
    next.setHours(twitterConfig.check_hour);
    next.setMinutes(twitterConfig.check_minute);
    next.setSeconds(0);
    next.setMilliseconds(0);
    
    return next;
  }
  
  /**
   * Test Twitter API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.credentials.bearer_token) {
        this.logger.error('Twitter Bearer Token not set');
        return false;
      }
      
      const response = await axios.get(
        `https://api.twitter.com/2/users/by/username/${this.credentials.username}`,
        {
          params: {
            'user.fields': 'pinned_tweet_id'
          },
          headers: {
            'Authorization': `Bearer ${this.credentials.bearer_token}`,
            'User-Agent': 'v2UserLookupJS'
          }
        }
      );
      
      if (response.data?.data) {
        this.logger.info('Twitter API connection successful', {
          username: this.credentials.username,
          userId: response.data.data.id,
          hasPinnedTweet: !!response.data.data.pinned_tweet_id
        });
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('Twitter API connection test failed', error);
      return false;
    }
  }
}