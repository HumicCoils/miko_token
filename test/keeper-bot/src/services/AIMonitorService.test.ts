import { PublicKey } from '@solana/web3.js';
import * as cron from 'node-cron';
import { logger } from '../../../../keeper-bot/src/utils/logger';
import { Program } from '@coral-xyz/anchor';

/**
 * TEST VERSION: Simplified AI Monitor for devnet
 * - Uses mock tweets instead of real Twitter API
 * - No Birdeye validation
 * - Selects first token found
 */
export class AIMonitorServiceTest {
  private smartDialProgram: Program;
  private mockTweets = [
    { text: 'This week reward token is $BONK! Enjoy!', created_at: new Date().toISOString() },
    { text: 'Rewarding holders with $USDC this time', created_at: new Date().toISOString() },
    { text: '$SOL rewards incoming!', created_at: new Date().toISOString() },
  ];
  private currentMockIndex = 0;

  constructor(smartDialProgram: Program) {
    this.smartDialProgram = smartDialProgram;
  }

  async start() {
    logger.info('[TEST MODE] Starting AI Monitor with mock tweets');
    
    // Schedule for every Monday at 03:00 UTC
    cron.schedule('0 3 * * 1', async () => {
      await this.checkAndUpdateRewardToken();
    });
    
    // Also run immediately for testing
    if (process.env.RUN_IMMEDIATELY === 'true') {
      await this.checkAndUpdateRewardToken();
    }
  }

  private async checkAndUpdateRewardToken() {
    try {
      logger.info('[TEST MODE] Checking mock tweets for reward token...');
      
      // Use mock tweet
      const mockTweet = this.mockTweets[this.currentMockIndex];
      this.currentMockIndex = (this.currentMockIndex + 1) % this.mockTweets.length;
      
      logger.info(`[TEST MODE] Processing mock tweet: "${mockTweet.text}"`);
      
      const symbols = this.extractSymbols(mockTweet.text);
      if (symbols.length > 0) {
        const symbol = symbols[0];
        
        // Use predefined test token addresses
        const testTokens: Record<string, string> = {
          'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
          'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          'SOL': '11111111111111111111111111111111',
        };
        
        const tokenAddress = testTokens[symbol] || PublicKey.default.toBase58();
        
        await this.updateSmartDial({
          address: tokenAddress,
          symbol: symbol,
        });
      }
    } catch (error) {
      logger.error('[TEST MODE] Error in AI monitor:', error);
    }
  }

  private extractSymbols(text: string): string[] {
    const regex = /\$([A-Z]+)/g;
    const matches = text.match(regex) || [];
    return [...new Set(matches.map(m => m.substring(1)))];
  }

  private async updateSmartDial(token: { address: string; symbol: string }) {
    try {
      logger.info(`[TEST MODE] Updating Smart Dial with token: ${token.symbol}`);
      
      const tx = await this.smartDialProgram.methods
        .updateRewardToken(new PublicKey(token.address), token.symbol)
        .rpc();
        
      logger.info(`[TEST MODE] Updated Smart Dial: ${tx}`);
    } catch (error) {
      logger.error('[TEST MODE] Failed to update Smart Dial:', error);
    }
  }
}