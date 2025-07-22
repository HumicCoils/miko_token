import { Connection, PublicKey } from '@solana/web3.js';
import { createLogger } from '../utils/logger';
import { Config } from '../config/config';
import { IBirdeyeAdapter } from '../interfaces/IBirdeyeAdapter';
import { TokenSearchResult } from '../interfaces/IBirdeyeAdapter';

const logger = createLogger('TokenSelector');

export interface TokenSelectionResult {
  success: boolean;
  symbol?: string;
  selectedToken?: TokenSearchResult;
  currentRewardToken?: PublicKey;
  needsUpdate: boolean;
  error?: string;
}

export class TokenSelector {
  private connection: Connection;
  private config: Config;
  private birdeyeAdapter: IBirdeyeAdapter;
  private smartDialProgramId: PublicKey;
  private currentRewardToken: PublicKey | undefined = undefined;

  constructor(
    connection: Connection,
    config: Config,
    birdeyeAdapter: IBirdeyeAdapter
  ) {
    this.connection = connection;
    this.config = config;
    this.birdeyeAdapter = birdeyeAdapter;
    this.smartDialProgramId = new PublicKey(config.programs.smart_dial_program_id);
    
    // Initialize with SOL as default
    this.currentRewardToken = new PublicKey('So11111111111111111111111111111111111111112');
  }

  /**
   * Select token with highest 24h volume for given symbol
   */
  async selectTokenBySymbol(symbol: string): Promise<TokenSelectionResult> {
    try {
      logger.info(`Searching for tokens with symbol: ${symbol}`);

      // Search for all tokens with this symbol
      const tokens = await this.birdeyeAdapter.searchTokensBySymbol(symbol);
      
      if (tokens.length === 0) {
        logger.warn(`No tokens found with symbol: ${symbol}`);
        return {
          success: false,
          symbol,
          needsUpdate: false,
          error: `No tokens found with symbol: ${symbol}`
        };
      }

      // Sort by 24h volume descending
      tokens.sort((a, b) => b.volume24h - a.volume24h);
      const selectedToken = tokens[0];

      logger.info(`Found ${tokens.length} tokens with symbol ${symbol}`);
      logger.info(`Selected token: ${selectedToken.name} (${selectedToken.address})`);
      logger.info(`24h volume: $${selectedToken.volume24h.toLocaleString()}`);

      // Check if this is different from current reward token
      const selectedTokenPubkey = new PublicKey(selectedToken.address);
      const needsUpdate = !this.currentRewardToken || 
                         !this.currentRewardToken.equals(selectedTokenPubkey);

      if (!needsUpdate) {
        logger.info('Selected token is already the current reward token');
      }

      return {
        success: true,
        symbol,
        selectedToken,
        currentRewardToken: this.currentRewardToken,
        needsUpdate
      };

    } catch (error) {
      logger.error('Failed to select token by symbol', { error });
      return {
        success: false,
        symbol,
        needsUpdate: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update reward token in Smart Dial program
   */
  async updateRewardToken(newToken: PublicKey): Promise<boolean> {
    try {
      logger.info(`Updating reward token to: ${newToken.toBase58()}`);

      // In mock mode, simulate the update
      if (this.config.adapters.birdeye === 'MockBirdeyeAdapter') {
        // Simulate success
        const mockTxid = `mock-token-update-${Date.now()}`;
        logger.info(`[MOCK] Token update transaction: ${mockTxid}`);
        
        this.currentRewardToken = newToken;
        return true;
      }

      // TODO: Real implementation would call Smart Dial's update_reward_token instruction
      // This would involve:
      // 1. Building the instruction with proper accounts
      // 2. Signing with keeper wallet
      // 3. Sending transaction
      // 4. Confirming transaction

      throw new Error('Real token update not implemented in mock phase');

    } catch (error) {
      logger.error('Failed to update reward token', { error });
      return false;
    }
  }

  /**
   * Get current reward token from Smart Dial
   */
  async getCurrentRewardToken(): Promise<PublicKey | undefined> {
    try {
      // In mock mode, return cached value
      if (this.config.adapters.birdeye === 'MockBirdeyeAdapter') {
        return this.currentRewardToken;
      }

      // TODO: Real implementation would query Smart Dial program state
      // This would involve:
      // 1. Finding the Smart Dial state PDA
      // 2. Fetching and decoding the account data
      // 3. Extracting the current reward token field

      return this.currentRewardToken;

    } catch (error) {
      logger.error('Failed to get current reward token', { error });
      return undefined;
    }
  }

  /**
   * Full token selection and update flow
   */
  async processTokenSelection(symbol: string): Promise<TokenSelectionResult> {
    // Select token
    const selectionResult = await this.selectTokenBySymbol(symbol);
    
    if (!selectionResult.success || !selectionResult.needsUpdate || !selectionResult.selectedToken) {
      return selectionResult;
    }

    // Update Smart Dial
    const updateSuccess = await this.updateRewardToken(
      new PublicKey(selectionResult.selectedToken.address)
    );

    if (!updateSuccess) {
      return {
        ...selectionResult,
        success: false,
        error: 'Failed to update Smart Dial with new token'
      };
    }

    logger.info(`Successfully updated reward token to ${symbol} (${selectionResult.selectedToken.address})`);
    
    return selectionResult;
  }

  /**
   * Validate token is suitable for rewards
   */
  async validateToken(tokenAddress: PublicKey): Promise<{
    valid: boolean;
    reason?: string;
  }> {
    try {
      const tokenInfo = await this.birdeyeAdapter.getTokenInfo(tokenAddress);
      
      if (!tokenInfo) {
        return { valid: false, reason: 'Token not found' };
      }

      // Check minimum liquidity
      const minLiquidity = 10000; // $10k minimum
      if (tokenInfo.marketCap * 0.1 < minLiquidity) { // Assume 10% of market cap is liquid
        return { valid: false, reason: 'Insufficient liquidity' };
      }

      // Check minimum volume
      const minVolume = 5000; // $5k daily volume minimum
      if (tokenInfo.volume24h < minVolume) {
        return { valid: false, reason: 'Insufficient trading volume' };
      }

      // Check minimum holders
      const minHolders = 50;
      if (tokenInfo.holders < minHolders) {
        return { valid: false, reason: 'Insufficient holder count' };
      }

      return { valid: true };

    } catch (error) {
      logger.error('Failed to validate token', { error });
      return { valid: false, reason: 'Validation error' };
    }
  }

  /**
   * Get status
   */
  getStatus(): {
    currentRewardToken: PublicKey | undefined;
    lastUpdateTime: number | null;
  } {
    return {
      currentRewardToken: this.currentRewardToken,
      lastUpdateTime: null // TODO: Track last update time
    };
  }

  /**
   * Reset selector state (for testing)
   */
  reset(): void {
    this.currentRewardToken = new PublicKey('So11111111111111111111111111111111111111112');
    logger.info('TokenSelector reset');
  }
}