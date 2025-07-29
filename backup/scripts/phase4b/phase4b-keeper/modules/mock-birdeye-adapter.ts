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
  private mockPriceUsd = 0.01; // MOCK PRICE $0.01 - Holders need 10,000 MIKO for $100
  
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
   * MOCK: Scans ALL token accounts on blockchain
   * Real implementation would use Birdeye API to get all holders
   */
  async getEligibleHolders(
    tokenMint: PublicKey,
    excludeAddresses: PublicKey[]
  ): Promise<EligibleHoldersResult> {
    try {
      const tokenPrice = this.mockPriceUsd;
      const minTokenAmount = MIN_HOLDER_VALUE_USD / tokenPrice; // 10,000 MIKO at $0.01
      
      logger.info('MOCK: Fetching ALL token holders from blockchain', {
        tokenPrice,
        minValueUsd: MIN_HOLDER_VALUE_USD,
        minTokenAmount: minTokenAmount / 1e9,
      });
      
      // Get ALL token accounts for this mint
      const accounts = await this.connection.getProgramAccounts(
        TOKEN_2022_PROGRAM_ID,
        {
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: tokenMint.toBase58(),
              },
            },
          ],
        }
      );
      
      const excludeSet = new Set(excludeAddresses.map(addr => addr.toBase58()));
      const holders: HolderInfo[] = [];
      let totalHolders = 0;
      
      // Process each token account
      for (const { pubkey: accountPubkey, account } of accounts) {
        try {
          // Parse token account to get owner and balance
          const { getAccount } = await import('@solana/spl-token');
          const tokenAccount = await getAccount(
            this.connection,
            accountPubkey,
            'confirmed',
            TOKEN_2022_PROGRAM_ID
          );
          
          const owner = tokenAccount.owner.toBase58();
          const balance = Number(tokenAccount.amount) / 1e9;
          
          if (balance > 0) {
            totalHolders++;
            
            if (excludeSet.has(owner)) {
              logger.debug(`Skipping excluded address: ${owner}`);
              continue;
            }
            
            const valueUsd = balance * tokenPrice;
            
            logger.debug(`Holder ${owner}: ${balance} MIKO = $${valueUsd}`);
            
            if (valueUsd >= MIN_HOLDER_VALUE_USD) {
              holders.push({
                address: owner,
                amount: balance * 1e9, // Convert back to lamports
                valueUsd,
                percentOfSupply: (balance / 1_000_000_000) * 100,
              });
              logger.info(`ELIGIBLE holder found: ${owner} with $${valueUsd} worth`);
            } else {
              logger.info(`Holder below threshold: ${owner} has only $${valueUsd}`);
            }
          }
        } catch (error) {
          logger.debug(`Failed to parse account ${accountPubkey.toBase58()}`, { error });
        }
      }
      
      logger.warn('MOCK RESULT: Scanned all token accounts on blockchain', {
        totalAccounts: accounts.length,
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