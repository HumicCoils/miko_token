import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { createLogger } from '../utils/logger';
import { Config } from '../config/config';

const logger = createLogger('FeeHarvester');

export interface HarvestResult {
  success: boolean;
  totalHarvested: number;
  accountsProcessed: number;
  txSignatures: string[];
  error?: string;
}

export interface WithheldFeesInfo {
  totalWithheld: number;
  accountCount: number;
  meetsThreshold: boolean;
  accounts: Array<{
    address: PublicKey;
    withheldAmount: number;
  }>;
}

export class FeeHarvester {
  private connection: Connection;
  private config: Config;
  private vaultProgramId: PublicKey;
  private tokenMint: PublicKey;
  private harvestThreshold: number;
  private harvestStateAccount: PublicKey; // PDA for harvest state
  private isHarvesting = false;
  private lastHarvestTime: number | null = null;
  private mockWithheldFees = 0; // For testing

  constructor(connection: Connection, config: Config) {
    this.connection = connection;
    this.config = config;
    this.vaultProgramId = new PublicKey(config.programs.vault_program_id);
    this.tokenMint = new PublicKey(config.token.mint_address);
    
    // Convert threshold to smallest units
    this.harvestThreshold = config.harvest.threshold_miko * Math.pow(10, config.token.decimals);
    
    // Derive PDA for harvest state (like real Solana programs)
    const [harvestStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('harvest_state'), this.tokenMint.toBuffer()],
      this.vaultProgramId
    );
    this.harvestStateAccount = harvestStatePDA;
  }

  /**
   * Query total withheld fees across all accounts
   */
  async getWithheldFeesInfo(): Promise<WithheldFeesInfo> {
    try {
      // In mock mode, return test data
      if (this.config.adapters.raydium === 'MockRaydiumAdapter') {
        return this.getMockWithheldFees();
      }

      // TODO: Real implementation would:
      // 1. Query all token accounts for the mint
      // 2. Filter accounts with withheld amounts > 0
      // 3. Sum up all withheld amounts
      // 4. Return structured info

      throw new Error('Real fee query not implemented in mock phase');

    } catch (error) {
      logger.error('Failed to query withheld fees', { error });
      return {
        totalWithheld: 0,
        accountCount: 0,
        meetsThreshold: false,
        accounts: []
      };
    }
  }

  /**
   * Check if harvest is needed based on threshold
   */
  async shouldHarvest(): Promise<boolean> {
    // In real implementation, would check on-chain harvest state account
    // This simulates Solana's account-based concurrency control
    const harvestState = await this.getHarvestState();
    
    if (harvestState.isLocked) {
      logger.debug('Harvest locked by on-chain state');
      return false;
    }

    const feesInfo = await this.getWithheldFeesInfo();
    
    logger.debug(`Withheld fees: ${feesInfo.totalWithheld / Math.pow(10, this.config.token.decimals)} MIKO`);
    logger.debug(`Threshold: ${this.config.harvest.threshold_miko} MIKO`);
    logger.debug(`Meets threshold: ${feesInfo.meetsThreshold}`);

    return feesInfo.meetsThreshold;
  }

  /**
   * Execute harvest operation with Solana account-based locking
   */
  async harvest(): Promise<HarvestResult> {
    // Try to acquire on-chain lock (simulating real Solana behavior)
    const lockAcquired = await this.acquireOnChainLock();
    
    if (!lockAcquired) {
      return {
        success: false,
        totalHarvested: 0,
        accountsProcessed: 0,
        txSignatures: [],
        error: 'Failed to acquire harvest lock - another harvest in progress'
      };
    }

    this.isHarvesting = true;

    try {
      logger.info('Starting harvest operation');

      const feesInfo = await this.getWithheldFeesInfo();
      
      if (!feesInfo.meetsThreshold) {
        return {
          success: false,
          totalHarvested: 0,
          accountsProcessed: 0,
          txSignatures: [],
          error: 'Threshold not met'
        };
      }

      // In mock mode, simulate harvest
      if (this.config.adapters.raydium === 'MockRaydiumAdapter') {
        return await this.mockHarvest(feesInfo);
      }

      // TODO: Real implementation would:
      // 1. Batch accounts into groups (e.g., 20 per transaction)
      // 2. Build harvest instruction for each batch
      // 3. Sign and send transactions
      // 4. Wait for confirmations
      // 5. Return results

      throw new Error('Real harvest not implemented in mock phase');

    } catch (error) {
      logger.error('Harvest operation failed', { error });
      return {
        success: false,
        totalHarvested: 0,
        accountsProcessed: 0,
        txSignatures: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      this.isHarvesting = false;
      await this.releaseOnChainLock();
    }
  }

  /**
   * Withdraw fees from mint to vault PDA
   * This is the NEW STEP in the 3-step tax flow
   */
  async withdrawFromMint(): Promise<HarvestResult> {
    try {
      logger.info('Starting withdraw from mint operation');

      // In mock mode, simulate withdrawal
      if (this.config.adapters.raydium === 'MockRaydiumAdapter') {
        logger.info('[MOCK] Simulating withdraw from mint to vault PDA');
        
        // Simulate transaction
        const txid = `mock-withdraw-${Date.now()}`;
        
        logger.info(`[MOCK] Withdraw from mint complete - Transaction: ${txid}`);
        
        return {
          success: true,
          totalHarvested: 0, // Amount is already tracked from harvest
          accountsProcessed: 1, // Just the mint account
          txSignatures: [txid],
        };
      }

      // TODO: Real implementation would:
      // 1. Build withdraw_fees_from_mint instruction
      // 2. Sign with keeper wallet
      // 3. Send transaction
      // 4. Wait for confirmation
      // 5. Return result

      throw new Error('Real withdraw from mint not implemented in mock phase');

    } catch (error) {
      logger.error('Withdraw from mint failed', { error });
      return {
        success: false,
        totalHarvested: 0,
        accountsProcessed: 0,
        txSignatures: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Mock harvest implementation
   */
  private async mockHarvest(feesInfo: WithheldFeesInfo): Promise<HarvestResult> {
    const batchSize = this.config.harvest.batch_size;
    const batches = Math.ceil(feesInfo.accountCount / batchSize);
    const txSignatures: string[] = [];

    logger.info(`[MOCK] Processing ${feesInfo.accountCount} accounts in ${batches} batches`);

    for (let i = 0; i < batches; i++) {
      const txid = `mock-harvest-${Date.now()}-${i}`;
      txSignatures.push(txid);
      
      logger.info(`[MOCK] Batch ${i + 1}/${batches} - Transaction: ${txid}`);
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Reset mock withheld fees
    this.mockWithheldFees = 0;
    this.lastHarvestTime = Date.now();

    const totalHarvestedMiko = feesInfo.totalWithheld / Math.pow(10, this.config.token.decimals);
    logger.info(`[MOCK] Harvest complete: ${totalHarvestedMiko} MIKO collected`);

    return {
      success: true,
      totalHarvested: feesInfo.totalWithheld,
      accountsProcessed: feesInfo.accountCount,
      txSignatures
    };
  }

  /**
   * Get mock withheld fees for testing
   */
  private getMockWithheldFees(): WithheldFeesInfo {
    // Generate mock accounts with fees
    const accounts = [];
    const accountCount = 50; // Mock 50 accounts with fees
    
    for (let i = 0; i < accountCount; i++) {
      const withheldAmount = Math.random() * 50000 * Math.pow(10, this.config.token.decimals);
      accounts.push({
        address: PublicKey.unique(),
        withheldAmount
      });
    }

    const totalWithheld = this.mockWithheldFees || 
      accounts.reduce((sum, acc) => sum + acc.withheldAmount, 0);
    
    const meetsThreshold = totalWithheld >= this.harvestThreshold;

    return {
      totalWithheld,
      accountCount: accounts.length,
      meetsThreshold,
      accounts
    };
  }

  /**
   * Add mock fees (for testing)
   */
  addMockFees(amount: number): void {
    const amountInSmallestUnits = amount * Math.pow(10, this.config.token.decimals);
    this.mockWithheldFees += amountInSmallestUnits;
    logger.info(`[MOCK] Added ${amount} MIKO to withheld fees`);
    logger.info(`[MOCK] Total withheld: ${this.mockWithheldFees / Math.pow(10, this.config.token.decimals)} MIKO`);
  }

  /**
   * Get harvest status
   */
  getStatus(): {
    isHarvesting: boolean;
    lastHarvestTime: number | null;
    thresholdMiko: number;
    currentWithheld?: number;
  } {
    return {
      isHarvesting: this.isHarvesting,
      lastHarvestTime: this.lastHarvestTime,
      thresholdMiko: this.config.harvest.threshold_miko,
      currentWithheld: this.mockWithheldFees / Math.pow(10, this.config.token.decimals)
    };
  }

  /**
   * Reset harvester state (for testing)
   */
  reset(): void {
    this.isHarvesting = false;
    this.lastHarvestTime = null;
    this.mockWithheldFees = 0;
    logger.info('FeeHarvester reset');
  }

  /**
   * Simulate on-chain harvest state (in real implementation, this would be an account query)
   */
  private async getHarvestState(): Promise<{ isLocked: boolean; lastHarvest: number }> {
    // In production, this would query the harvest state PDA
    return {
      isLocked: this.isHarvesting,
      lastHarvest: this.lastHarvestTime || 0
    };
  }
  
  /**
   * Acquire on-chain lock (simulates Solana account locking)
   */
  private async acquireOnChainLock(): Promise<boolean> {
    // In real implementation, this would be a CPI to the vault program
    // to update the harvest state account with a lock flag
    
    // Simulate atomic check-and-set operation
    const currentState = await this.getHarvestState();
    
    if (currentState.isLocked) {
      logger.warn('Harvest already locked on-chain');
      return false;
    }
    
    // Simulate updating on-chain state
    logger.info('Acquired on-chain harvest lock');
    return true;
  }
  
  /**
   * Release on-chain lock
   */
  private async releaseOnChainLock(): Promise<void> {
    // In real implementation, this would update the harvest state account
    logger.info('Released on-chain harvest lock');
  }
}