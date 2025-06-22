import { TwitterApi } from 'twitter-api-v2';
import { PublicKey } from '@solana/web3.js';
import { logger } from '../utils/logger';
import { config } from '../config';
import { BirdeyeClient } from '../clients/BirdeyeClient';
import { SmartDialService } from './SmartDialService';
import * as cron from 'node-cron';

interface Tweet {
  id: string;
  text: string;
  created_at: string;
}

interface TokenCandidate {
  symbol: string;
  address: string;
  volume24h: number;
}

export class AIAgentMonitor {
  private twitterClient: TwitterApi;
  private birdeyeClient: BirdeyeClient;
  private smartDialService: SmartDialService;
  private lastProcessedTweetId: string | null = null;

  constructor(
    birdeyeClient: BirdeyeClient,
    smartDialService: SmartDialService
  ) {
    this.twitterClient = new TwitterApi(config.TWITTER_BEARER_TOKEN);
    this.birdeyeClient = birdeyeClient;
    this.smartDialService = smartDialService;
  }

  /**
   * Start monitoring AI agent tweets
   * Checks every Monday at 03:00 UTC
   */
  async startMonitoring(): Promise<void> {
    logger.info('Starting AI Agent Monitor for @project_miko');
    
    // Schedule for every Monday at 03:00 UTC
    cron.schedule('0 3 * * 1', async () => {
      logger.info('Running scheduled reward token check');
      await this.checkForRewardToken();
    });

    // Also check immediately on startup
    await this.checkForRewardToken();
    
    logger.info('AI Agent Monitor scheduled for Mondays at 03:00 UTC');
  }

  /**
   * Check for new reward token tweet from @project_miko
   */
  private async checkForRewardToken(): Promise<void> {
    try {
      const tweets = await this.fetchRecentTweets();
      
      for (const tweet of tweets) {
        if (this.isNewTweet(tweet)) {
          const token = await this.extractAndValidateToken(tweet);
          
          if (token) {
            logger.info(`New reward token selected: ${token.symbol} (${token.address})`);
            await this.updateRewardToken(token);
            this.lastProcessedTweetId = tweet.id;
            break; // Process only the most recent valid tweet
          }
        }
      }
    } catch (error) {
      logger.error('Error checking for reward token:', error);
    }
  }

  /**
   * Fetch recent tweets from @project_miko
   */
  private async fetchRecentTweets(): Promise<Tweet[]> {
    try {
      // Get tweets from the last 3 hours (00:00 - 03:00 UTC window)
      const threehours:Ago = new Date();
      threeHoursAgo.setHours(threeHoursAgo.getHours() - 3);
      
      const tweets = await this.twitterClient.v2.userTimeline('project_miko', {
        max_results: 10,
        start_time: threeHoursAgo.toISOString(),
        'tweet.fields': ['created_at', 'text'],
      });

      return tweets.data?.data || [];
    } catch (error) {
      logger.error('Error fetching tweets from @project_miko:', error);
      throw error;
    }
  }

  /**
   * Check if tweet is new (not already processed)
   */
  private isNewTweet(tweet: Tweet): boolean {
    return !this.lastProcessedTweetId || tweet.id > this.lastProcessedTweetId;
  }

  /**
   * Extract token symbol from tweet and validate via Birdeye
   */
  private async extractAndValidateToken(tweet: Tweet): Promise<TokenCandidate | null> {
    try {
      // Extract all $SYMBOL mentions from tweet
      const symbols = this.extractSymbols(tweet.text);
      
      if (symbols.length === 0) {
        return null;
      }

      // Look up each symbol in Birdeye and find highest volume
      const candidates: TokenCandidate[] = [];
      
      for (const symbol of symbols) {
        try {
          const tokens = await this.birdeyeClient.searchTokenBySymbol(symbol);
          
          // Find the token with highest 24h volume
          let highestVolumeToken = null;
          let highestVolume = 0;
          
          for (const token of tokens) {
            const info = await this.birdeyeClient.getTokenInfo(token.address);
            
            if (info.volume24h > highestVolume) {
              highestVolume = info.volume24h;
              highestVolumeToken = {
                symbol: symbol,
                address: token.address,
                volume24h: info.volume24h,
              };
            }
          }
          
          if (highestVolumeToken) {
            candidates.push(highestVolumeToken);
          }
        } catch (error) {
          logger.warn(`Failed to lookup symbol ${symbol}:`, error);
        }
      }

      // Return the candidate with highest volume across all symbols
      if (candidates.length === 0) {
        return null;
      }

      return candidates.reduce((prev, current) => 
        current.volume24h > prev.volume24h ? current : prev
      );
    } catch (error) {
      logger.error('Error extracting and validating token:', error);
      return null;
    }
  }

  /**
   * Extract $SYMBOL mentions from tweet text
   */
  private extractSymbols(text: string): string[] {
    const regex = /\$([A-Z]+)/g;
    const matches = text.match(regex);
    
    if (!matches) {
      return [];
    }

    // Remove the $ and return unique symbols
    const symbols = matches.map(match => match.substring(1));
    return [...new Set(symbols)];
  }

  /**
   * Update the reward token in Smart Dial program
   */
  private async updateRewardToken(token: TokenCandidate): Promise<void> {
    try {
      await this.smartDialService.updateRewardToken(
        new PublicKey(token.address),
        token.symbol
      );
      
      logger.info(`Successfully updated reward token to ${token.symbol}`);
    } catch (error) {
      logger.error('Failed to update reward token:', error);
      throw error;
    }
  }
}