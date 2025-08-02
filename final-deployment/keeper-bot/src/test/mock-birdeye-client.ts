import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAccount } from '@solana/spl-token';
import { Logger } from '../utils/logger';
import { TokenHolder } from '../api/birdeye-client';

/**
 * Mock Birdeye client for local testing
 * Uses on-chain data and mock prices
 */
export class MockBirdeyeClient {
  private connection: Connection;
  private logger: Logger;
  
  constructor(connection: Connection, logger: Logger) {
    this.connection = connection;
    this.logger = logger;
  }
  
  /**
   * Get token holders by scanning on-chain accounts
   */
  async getTokenHolders(tokenAddress: string, limit: number = 100): Promise<TokenHolder[]> {
    try {
      this.logger.info('MockBirdeyeClient: Scanning on-chain accounts for holders');
      
      const tokenMint = new PublicKey(tokenAddress);
      const holders: TokenHolder[] = [];
      
      // Get all token accounts for the mint
      const accounts = await this.connection.getProgramAccounts(
        TOKEN_2022_PROGRAM_ID,
        {
          filters: [
            { dataSize: 165 }, // Token account size
            { memcmp: { offset: 0, bytes: tokenMint.toBase58() } }
          ]
        }
      );
      
      let totalSupply = 0;
      
      // Process each account
      for (const account of accounts) {
        try {
          const tokenAccount = await getAccount(
            this.connection,
            account.pubkey,
            'confirmed',
            TOKEN_2022_PROGRAM_ID
          );
          
          const balance = Number(tokenAccount.amount);
          if (balance > 0) {
            holders.push({
              owner: tokenAccount.owner.toBase58(),
              balance: balance,
              percentage: 0 // Will calculate after
            });
            totalSupply += balance;
          }
        } catch {
          // Skip invalid accounts
        }
      }
      
      // Calculate percentages
      for (const holder of holders) {
        holder.percentage = (holder.balance / totalSupply) * 100;
      }
      
      // Sort by balance descending and limit
      holders.sort((a, b) => b.balance - a.balance);
      const limitedHolders = holders.slice(0, limit);
      
      this.logger.info('MockBirdeyeClient: Found holders', {
        total: holders.length,
        returned: limitedHolders.length
      });
      
      return limitedHolders;
      
    } catch (error: any) {
      this.logger.error('MockBirdeyeClient: Failed to get token holders', {
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Get mock token price based on pool ratio
   */
  async getTokenPrice(tokenAddress: string): Promise<number> {
    this.logger.info('MockBirdeyeClient: Using mock price calculation', {
      token: tokenAddress
    });
    
    // Mock price calculation based on initial pool ratio
    // Initial pool: 45M MIKO = 0.5 SOL
    // With SOL at $190, that's $95 for 45M MIKO
    // So 1 MIKO = $95 / 45,000,000 = $0.00000211
    const solPrice = 190; // Mock SOL price
    const mockMikoPrice = (0.5 * solPrice) / 45_000_000;
    
    this.logger.info('MockBirdeyeClient: Mock price calculated', {
      solPrice,
      mikoPrice: mockMikoPrice,
      mikoPerMillion: mockMikoPrice * 1_000_000
    });
    
    return mockMikoPrice;
  }
  
  /**
   * Search tokens by symbol (returns empty for testing)
   */
  async searchTokens(symbol: string, _limit: number = 10): Promise<any[]> {
    this.logger.info('MockBirdeyeClient: Token search not available in test mode', {
      symbol,
      note: 'Would limit to ' + _limit + ' results in production'
    });
    return [];
  }
  
}