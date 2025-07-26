/**
 * MOCK BIRDEYE ADAPTER FOR LOCAL FORK TESTING ONLY
 * 
 * This is NOT a real Birdeye API integration. It provides mock functionality
 * for testing the keeper bot on local fork where Birdeye API is not available.
 * 
 * In production, this would be replaced with actual Birdeye API calls.
 * 
 * Mock behavior:
 * - Uses hardcoded price of $0.0001 per MIKO
 * - Scans known addresses from deployment for holders
 * - Filters based on $100 USD minimum value
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAccount } from '@solana/spl-token';
import { createLogger } from '../utils/logger';

const logger = createLogger('MockBirdeyeAdapter');

const MIN_HOLDER_VALUE_USD = 100; // $100 minimum from PLAN.md

export interface HolderInfo {
  address: string;
  amount: number;
  valueUsd: number;
  percentOfSupply: number;
}

export interface EligibleHoldersResult {
  totalHolders: number;
  eligibleHolders: number;
  holders: HolderInfo[];
  tokenPrice: number;
  minValueUsd: number;
}

export class MockBirdeyeAdapter {
  private connection: Connection;
  private mockPriceUsd = 0.0001; // MOCK PRICE - NOT REAL
  
  constructor(connection: Connection) {
    this.connection = connection;
    logger.warn('USING MOCK BIRDEYE ADAPTER - FOR LOCAL TESTING ONLY');
  }
  
  /**
   * MOCK: Returns hardcoded price for testing
   * Real implementation would call Birdeye API
   */
  async getTokenPrice(tokenMint: PublicKey): Promise<number> {
    logger.info('MOCK: Returning hardcoded price', { 
      price: this.mockPriceUsd,
      note: 'This is not a real price - for testing only'
    });
    return this.mockPriceUsd;
  }
  
  /**
   * MOCK: Scans known addresses from deployment
   * Real implementation would use Birdeye API to get all holders
   */
  async getEligibleHolders(
    tokenMint: PublicKey,
    excludeAddresses: PublicKey[]
  ): Promise<EligibleHoldersResult> {
    try {
      const tokenPrice = this.mockPriceUsd;
      const minTokenAmount = MIN_HOLDER_VALUE_USD / tokenPrice; // 1,000,000 MIKO at $0.0001
      
      logger.info('MOCK: Fetching holders from known addresses', {
        tokenPrice,
        minValueUsd: MIN_HOLDER_VALUE_USD,
        minTokenAmount: minTokenAmount / 1e9,
        note: 'Using hardcoded addresses - not comprehensive'
      });
      
      // Known addresses from phase4b deployment
      const knownAddresses = [
        'CDTSFkBB1TuRw7WFZj4ZQpagwBhw5iURjC13kS6hEgSc', // Deployer
        'D24rokM1eAxWAU9MQYuXK9QK4jnT1qJ23VP4dCqaw5uh', // Owner  
        '6LTnRkPHh27xTgpfkzibe7XcUSGe3kVazvweei1D3syn', // Keeper
        // Test wallet addresses would be added here after swap test
      ];
      
      const excludeSet = new Set(excludeAddresses.map(addr => addr.toBase58()));
      const holders: HolderInfo[] = [];
      let totalHolders = 0;
      
      for (const address of knownAddresses) {
        if (excludeSet.has(address)) {
          logger.debug(`Skipping excluded address: ${address}`);
          continue;
        }
        
        try {
          const pubkey = new PublicKey(address);
          const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
            pubkey,
            { mint: tokenMint }
          );
          
          for (const account of tokenAccounts.value) {
            const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
            if (balance > 0) {
              totalHolders++;
              const valueUsd = balance * tokenPrice;
              
              logger.debug(`Holder ${address}: ${balance} MIKO = $${valueUsd}`);
              
              if (valueUsd >= MIN_HOLDER_VALUE_USD) {
                holders.push({
                  address,
                  amount: balance * 1e9, // Convert to lamports
                  valueUsd,
                  percentOfSupply: (balance / 1_000_000_000) * 100,
                });
                logger.info(`ELIGIBLE holder found: ${address} with $${valueUsd} worth`);
              } else {
                logger.info(`Holder below threshold: ${address} has only $${valueUsd}`);
              }
            }
          }
        } catch (error) {
          logger.debug(`Failed to check address ${address}`, { error });
        }
      }
      
      logger.warn('MOCK RESULT: Only checking known addresses, not all holders', {
        checkedAddresses: knownAddresses.length,
        totalHolders,
        eligibleHolders: holders.length,
      });
      
      return {
        totalHolders,
        eligibleHolders: holders.length,
        holders,
        tokenPrice,
        minValueUsd: MIN_HOLDER_VALUE_USD,
      };
      
    } catch (error) {
      logger.error('Failed to get mock holders', { error });
      return {
        totalHolders: 0,
        eligibleHolders: 0,
        holders: [],
        tokenPrice: this.mockPriceUsd,
        minValueUsd: MIN_HOLDER_VALUE_USD,
      };
    }
  }
  
  /**
   * Helper to set different mock price for testing scenarios
   * @param priceUsd Mock price in USD
   */
  setMockPrice(priceUsd: number): void {
    this.mockPriceUsd = priceUsd;
    logger.warn('MOCK price updated', { 
      price: priceUsd,
      note: 'This is for testing only - not a real price'
    });
  }
  
  /**
   * Helper to add test wallet addresses after swap test
   * In real implementation, this wouldn't exist
   */
  addTestWalletAddresses(addresses: string[]): void {
    logger.warn('This is a mock-only function to add test addresses');
    // Would need to modify the knownAddresses array
  }
}