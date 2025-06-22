import { TwitterApi } from 'twitter-api-v2';
import { PublicKey } from '@solana/web3.js';
import * as cron from 'node-cron';
import axios from 'axios';
import { logger } from '../utils/logger';
import { Program } from '@coral-xyz/anchor';

interface Tweet {
  id: string;
  text: string;
  created_at: string;
}

export class AIMonitorService {
  private twitterClient: TwitterApi;
  private smartDialProgram: Program;
  private lastProcessedTweetId: string | null = null;

  constructor(smartDialProgram: Program) {
    this.smartDialProgram = smartDialProgram;
    this.twitterClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN!);
  }

  async start() {
    logger.info('Starting AI Monitor Service');
    
    // Schedule for every Monday at 03:00 UTC
    cron.schedule('0 3 * * 1', async () => {
      await this.checkAndUpdateRewardToken();
    });
    
    // Also check on startup
    const now = new Date();
    if (now.getDay() === 1 && now.getUTCHours() >= 3) {
      await this.checkAndUpdateRewardToken();
    }
  }

  private async checkAndUpdateRewardToken() {
    try {
      logger.info('Checking @project_miko tweets for reward token...');
      
      // Get tweets from last 3 hours
      const threeHoursAgo = new Date();
      threeHoursAgo.setHours(threeHoursAgo.getHours() - 3);
      
      const tweets = await this.twitterClient.v2.userTimeline('project_miko', {
        max_results: 10,
        start_time: threeHoursAgo.toISOString(),
        'tweet.fields': ['created_at', 'text'],
      });
      
      if (!tweets.data?.data || tweets.data.data.length === 0) {
        logger.warn('No recent tweets found');
        return;
      }
      
      // Process most recent tweet first
      for (const tweet of tweets.data.data) {
        const symbols = this.extractSymbols(tweet.text);
        if (symbols.length > 0) {
          const selectedToken = await this.selectTokenWithHighestVolume(symbols);
          if (selectedToken) {
            await this.updateSmartDial(selectedToken);
            this.lastProcessedTweetId = tweet.id;
            break;
          }
        }
      }
    } catch (error) {
      logger.error('Error in AI monitor:', error);
    }
  }

  private extractSymbols(text: string): string[] {
    const regex = /\$([A-Z]+)/g;
    const matches = text.match(regex) || [];
    return [...new Set(matches.map(m => m.substring(1)))];
  }

  private async selectTokenWithHighestVolume(symbols: string[]): Promise<{
    address: string;
    symbol: string;
    volume24h: number;
  } | null> {
    let bestToken = null;
    let highestVolume = 0;
    
    for (const symbol of symbols) {
      try {
        // Search Birdeye for tokens with this symbol
        const response = await axios.get(
          `https://public-api.birdeye.so/defi/search`,
          {
            params: { query: symbol, chain: 'solana' },
            headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY },
          }
        );
        
        if (response.data.success && response.data.data.tokens) {
          for (const token of response.data.data.tokens) {
            if (token.symbol.toUpperCase() === symbol && token.volume24h > highestVolume) {
              highestVolume = token.volume24h;
              bestToken = {
                address: token.address,
                symbol: symbol,
                volume24h: token.volume24h,
              };
            }
          }
        }
      } catch (error) {
        logger.error(`Failed to search for symbol ${symbol}:`, error);
      }
    }
    
    if (bestToken) {
      logger.info(`Selected token: ${bestToken.symbol} with 24h volume: $${bestToken.volume24h}`);
    }
    
    return bestToken;
  }

  private async updateSmartDial(token: { address: string; symbol: string }) {
    try {
      const tx = await this.smartDialProgram.methods
        .updateRewardToken(new PublicKey(token.address), token.symbol)
        .rpc();
        
      logger.info(`Updated Smart Dial with reward token ${token.symbol}: ${tx}`);
    } catch (error) {
      logger.error('Failed to update Smart Dial:', error);
    }
  }
}