import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { createLogger } from '../utils/logger';
import { Config } from '../config/config';
import { IBirdeyeAdapter, TokenHolder } from '../interfaces/IBirdeyeAdapter';

const logger = createLogger('DistributionEngine');

export interface DistributionPlan {
  totalAmount: number;
  rewardToken: PublicKey;
  eligibleHolders: Array<{
    address: PublicKey;
    balance: number;
    usdValue: number;
    percentage: number;
    rewardAmount: number;
  }>;
  excludedHolders: number;
  totalEligible: number;
}

export interface DistributionResult {
  success: boolean;
  distributed: number;
  recipients: number;
  txSignatures: string[];
  failed: Array<{
    address: PublicKey;
    amount: number;
    error: string;
  }>;
  error?: string;
}

export class DistributionEngine {
  private connection: Connection;
  private config: Config;
  private birdeyeAdapter: IBirdeyeAdapter;
  private tokenMint: PublicKey;
  private rewardExclusions: Set<string> = new Set();
  private minUsdValue = 100; // $100 minimum

  constructor(
    connection: Connection,
    config: Config,
    birdeyeAdapter: IBirdeyeAdapter
  ) {
    this.connection = connection;
    this.config = config;
    this.birdeyeAdapter = birdeyeAdapter;
    this.tokenMint = new PublicKey(config.token.mint_address);
    
    // Initialize exclusion list (would be loaded from vault in real implementation)
    this.initializeExclusions();
  }

  private initializeExclusions(): void {
    // System accounts that are always excluded
    const systemExclusions = [
      this.config.keeper.wallet_pubkey,
      this.config.programs.vault_program_id,
      this.config.programs.smart_dial_program_id,
      // Owner and treasury would be loaded from vault state
    ];

    systemExclusions.forEach(addr => this.rewardExclusions.add(addr));
    logger.info(`Initialized with ${this.rewardExclusions.size} exclusions`);
  }

  /**
   * Create distribution plan for rewards
   */
  async createDistributionPlan(
    totalAmount: number,
    rewardToken: PublicKey
  ): Promise<DistributionPlan> {
    try {
      logger.info(`Creating distribution plan for ${totalAmount} of ${rewardToken.toBase58()}`);

      // Get all holders with minimum USD value
      const holders = await this.birdeyeAdapter.getTokenHolders(
        this.tokenMint,
        this.minUsdValue,
        1000 // Max 1000 holders
      );

      // Filter out excluded addresses
      const eligibleHolders = holders.filter(
        holder => !this.rewardExclusions.has(holder.address)
      );

      const excludedCount = holders.length - eligibleHolders.length;
      logger.info(`Found ${holders.length} holders, ${excludedCount} excluded`);

      // Calculate total eligible balance for proportional distribution
      const totalEligibleBalance = eligibleHolders.reduce(
        (sum, holder) => sum + holder.balance,
        0
      );

      // Calculate reward amounts
      const distribution = eligibleHolders.map(holder => {
        const percentage = holder.balance / totalEligibleBalance;
        const rewardAmount = totalAmount * percentage;
        
        return {
          address: new PublicKey(holder.address),
          balance: holder.balance,
          usdValue: holder.usdValue,
          percentage: percentage * 100,
          rewardAmount
        };
      });

      // Sort by reward amount descending
      distribution.sort((a, b) => b.rewardAmount - a.rewardAmount);

      logger.info(`Distribution plan created for ${distribution.length} recipients`);
      logger.info(`Top recipient: ${distribution[0]?.percentage.toFixed(2)}% (${distribution[0]?.rewardAmount.toFixed(4)} tokens)`);

      return {
        totalAmount,
        rewardToken,
        eligibleHolders: distribution,
        excludedHolders: excludedCount,
        totalEligible: distribution.length
      };

    } catch (error) {
      logger.error('Failed to create distribution plan', { error });
      throw error;
    }
  }

  /**
   * Execute distribution according to plan
   */
  async executeDistribution(plan: DistributionPlan): Promise<DistributionResult> {
    const txSignatures: string[] = [];
    const failed: DistributionResult['failed'] = [];
    let totalDistributed = 0;
    let recipientCount = 0;

    try {
      logger.info(`Starting distribution to ${plan.eligibleHolders.length} recipients`);

      // In mock mode, simulate distribution
      if (this.config.adapters.birdeye === 'MockBirdeyeAdapter') {
        return await this.mockDistribution(plan);
      }

      // TODO: Real implementation would:
      // 1. Create SPL token transfer instructions
      // 2. Batch transfers (e.g., 10 per transaction)
      // 3. Sign and send transactions
      // 4. Track successes and failures
      // 5. Handle retries for failed transfers

      throw new Error('Real distribution not implemented in mock phase');

    } catch (error) {
      logger.error('Distribution execution failed', { error });
      return {
        success: false,
        distributed: totalDistributed,
        recipients: recipientCount,
        txSignatures,
        failed,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Mock distribution implementation
   */
  private async mockDistribution(plan: DistributionPlan): Promise<DistributionResult> {
    const batchSize = 10; // 10 recipients per transaction
    const batches = Math.ceil(plan.eligibleHolders.length / batchSize);
    const txSignatures: string[] = [];
    const failed: DistributionResult['failed'] = [];

    logger.info(`[MOCK] Processing ${plan.eligibleHolders.length} recipients in ${batches} batches`);

    let totalDistributed = 0;
    let recipientCount = 0;

    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, plan.eligibleHolders.length);
      const batchRecipients = plan.eligibleHolders.slice(start, end);
      
      // Simulate 5% failure rate
      const shouldFail = Math.random() < 0.05;
      
      if (shouldFail && i > 0) { // Don't fail first batch
        const failedRecipient = batchRecipients[0];
        failed.push({
          address: failedRecipient.address,
          amount: failedRecipient.rewardAmount,
          error: 'Mock transfer failure'
        });
        logger.warn(`[MOCK] Batch ${i + 1} failed`);
      } else {
        const txid = `mock-distribution-${Date.now()}-${i}`;
        txSignatures.push(txid);
        
        const batchAmount = batchRecipients.reduce((sum, r) => sum + r.rewardAmount, 0);
        totalDistributed += batchAmount;
        recipientCount += batchRecipients.length;
        
        logger.info(`[MOCK] Batch ${i + 1}/${batches} - Transaction: ${txid}`);
        logger.info(`[MOCK] Distributed ${batchAmount.toFixed(4)} to ${batchRecipients.length} recipients`);
      }
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const success = failed.length === 0;
    logger.info(`[MOCK] Distribution complete: ${totalDistributed.toFixed(4)} tokens to ${recipientCount} recipients`);
    
    if (failed.length > 0) {
      logger.warn(`[MOCK] ${failed.length} transfers failed`);
    }

    return {
      success,
      distributed: totalDistributed,
      recipients: recipientCount,
      txSignatures,
      failed
    };
  }

  /**
   * Add address to exclusion list
   */
  addExclusion(address: string): void {
    this.rewardExclusions.add(address);
    logger.info(`Added ${address} to exclusion list`);
  }

  /**
   * Remove address from exclusion list
   */
  removeExclusion(address: string): void {
    this.rewardExclusions.delete(address);
    logger.info(`Removed ${address} from exclusion list`);
  }

  /**
   * Get current exclusion list
   */
  getExclusions(): string[] {
    return Array.from(this.rewardExclusions);
  }

  /**
   * Validate distribution parameters
   */
  validateDistribution(
    amount: number,
    recipientCount: number
  ): { valid: boolean; reason?: string } {
    // Check minimum amount
    if (amount <= 0) {
      return { valid: false, reason: 'Amount must be positive' };
    }

    // Check recipient count
    if (recipientCount === 0) {
      return { valid: false, reason: 'No eligible recipients' };
    }

    // Check minimum per recipient (avoid dust)
    const minPerRecipient = 0.000001; // Minimum meaningful amount
    const avgPerRecipient = amount / recipientCount;
    
    if (avgPerRecipient < minPerRecipient) {
      return { valid: false, reason: 'Amount too small for recipient count' };
    }

    return { valid: true };
  }

  /**
   * Get status
   */
  getStatus(): {
    minUsdValue: number;
    exclusionCount: number;
    rewardToken: PublicKey | null;
  } {
    return {
      minUsdValue: this.minUsdValue,
      exclusionCount: this.rewardExclusions.size,
      rewardToken: null // Would be fetched from Smart Dial
    };
  }

  /**
   * Reset engine state (for testing)
   */
  reset(): void {
    this.rewardExclusions.clear();
    this.initializeExclusions();
    logger.info('DistributionEngine reset');
  }
}