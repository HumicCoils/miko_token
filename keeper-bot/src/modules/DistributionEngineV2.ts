import { Connection, PublicKey } from '@solana/web3.js';
import { createLogger } from '../utils/logger';
import { Config } from '../config/config';
import { IHolderData, HolderInfo, IBirdeyeAdapter } from '../interfaces/IBirdeyeAdapter';

const logger = createLogger('DistributionEngineV2');

export interface DistributionHolder {
  address: PublicKey;
  balance: number;
  usdValue: number;
  percentage: number;
  rewardAmount: number;
}

export interface DistributionPlan {
  totalAmount: number;
  rewardToken: PublicKey;
  eligibleHolders: DistributionHolder[];
  excludedHolders: number;
  totalEligible: number;
  undistributedFromPrevious: number;  // NEW: Track previous undistributed
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
  undistributedAmount?: number;  // NEW: Amount that couldn't be distributed
  error?: string;
}

/**
 * Enhanced Distribution Engine with rollover support
 * Tracks and includes undistributed amounts from previous cycles
 */
export class DistributionEngineV2 {
  private connection: Connection;
  private config: Config;
  private birdeyeAdapter: IBirdeyeAdapter;
  private rewardExclusions: Set<string>;
  private minUsdValue: number;
  
  // NEW: Persistent storage for undistributed amounts
  private undistributedBalance: number = 0;
  private undistributedToken: PublicKey | null = null;
  private lastUndistributedUpdate: number = 0;

  constructor(
    connection: Connection,
    config: Config,
    birdeyeAdapter: IBirdeyeAdapter
  ) {
    this.connection = connection;
    this.config = config;
    this.birdeyeAdapter = birdeyeAdapter;
    this.rewardExclusions = new Set();
    this.minUsdValue = config.distribution.min_usd_value;
    
    this.initializeExclusions();
    this.loadUndistributedBalance();
  }

  /**
   * Initialize exclusion lists
   */
  private initializeExclusions(): void {
    // System wallets
    const systemExclusions = [
      this.config.wallets.owner,
      this.config.wallets.treasury,
      this.config.keeper.wallet_pubkey,
      this.config.programs.absolute_vault,
      // Add vault PDA and other system accounts
    ];

    systemExclusions.forEach(addr => this.rewardExclusions.add(addr));
    logger.info(`Initialized with ${this.rewardExclusions.size} exclusions`);
  }

  /**
   * Load undistributed balance from persistent storage
   */
  private loadUndistributedBalance(): void {
    // In production, this would load from a database or file
    // For now, initialize to 0
    this.undistributedBalance = 0;
    logger.info(`Loaded undistributed balance: ${this.undistributedBalance}`);
  }

  /**
   * Save undistributed balance to persistent storage
   */
  private async saveUndistributedBalance(): Promise<void> {
    // In production, save to database or file
    logger.info(`Saved undistributed balance: ${this.undistributedBalance}`);
  }

  /**
   * Get current undistributed balance info
   */
  getUndistributedInfo(): {
    amount: number;
    token: PublicKey | null;
    lastUpdate: number;
  } {
    return {
      amount: this.undistributedBalance,
      token: this.undistributedToken,
      lastUpdate: this.lastUndistributedUpdate
    };
  }

  /**
   * Create distribution plan with rollover support
   */
  async createDistributionPlan(
    totalAmount: number,
    rewardToken: PublicKey
  ): Promise<DistributionPlan> {
    try {
      logger.info(`Creating distribution plan for ${totalAmount} tokens`);
      
      // Check for undistributed balance from previous cycles
      let effectiveAmount = totalAmount;
      if (this.undistributedBalance > 0) {
        if (this.undistributedToken && this.undistributedToken.equals(rewardToken)) {
          // Same token - add to current distribution
          effectiveAmount += this.undistributedBalance;
          logger.info(`Including ${this.undistributedBalance} undistributed tokens from previous cycle`);
          logger.info(`Total amount to distribute: ${effectiveAmount}`);
        } else if (this.undistributedToken) {
          // Different token - log warning
          logger.warn(`Undistributed balance is in different token: ${this.undistributedToken.toBase58()}`);
          logger.warn(`Current distribution token: ${rewardToken.toBase58()}`);
          // In production, might need to swap or handle separately
        }
      }

      // Fetch holder data
      const holderData = await this.birdeyeAdapter.getTokenHolders(
        this.config.tokens.miko_mint,
        100  // Top 100 holders
      );

      // Filter eligible holders
      const eligibleHolders: HolderInfo[] = [];
      let excludedCount = 0;
      let totalEligibleBalance = 0;

      for (const holder of holderData.holders) {
        // Check exclusion list
        if (this.rewardExclusions.has(holder.address)) {
          excludedCount++;
          continue;
        }

        // Check minimum USD value
        if (holder.usdValue < this.minUsdValue) {
          excludedCount++;
          continue;
        }

        eligibleHolders.push(holder);
        totalEligibleBalance += holder.balance;
      }

      logger.info(`Found ${eligibleHolders.length} eligible holders out of ${holderData.holders.length}`);
      logger.info(`Excluded ${excludedCount} holders (system wallets or below $${this.minUsdValue})`);

      // If no eligible holders, entire amount becomes undistributed
      if (eligibleHolders.length === 0) {
        logger.warn('NO ELIGIBLE HOLDERS FOUND - All funds will be saved for next cycle');
        return {
          totalAmount: effectiveAmount,
          rewardToken,
          eligibleHolders: [],
          excludedHolders: excludedCount,
          totalEligible: 0,
          undistributedFromPrevious: this.undistributedBalance
        };
      }

      // Calculate reward amounts
      const distribution = eligibleHolders.map(holder => {
        const percentage = holder.balance / totalEligibleBalance;
        const rewardAmount = effectiveAmount * percentage;
        
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
        totalAmount: effectiveAmount,
        rewardToken,
        eligibleHolders: distribution,
        excludedHolders: excludedCount,
        totalEligible: distribution.length,
        undistributedFromPrevious: this.undistributedBalance
      };

    } catch (error) {
      logger.error('Failed to create distribution plan', { error });
      throw error;
    }
  }

  /**
   * Execute distribution with rollover support
   */
  async executeDistribution(plan: DistributionPlan): Promise<DistributionResult> {
    const txSignatures: string[] = [];
    const failed: DistributionResult['failed'] = [];
    let totalDistributed = 0;
    let recipientCount = 0;

    try {
      logger.info(`Starting distribution of ${plan.totalAmount} tokens to ${plan.eligibleHolders.length} recipients`);

      // Handle case where no eligible holders exist
      if (plan.eligibleHolders.length === 0) {
        // Save entire amount as undistributed
        this.undistributedBalance = plan.totalAmount;
        this.undistributedToken = plan.rewardToken;
        this.lastUndistributedUpdate = Date.now();
        await this.saveUndistributedBalance();
        
        logger.warn(`NO DISTRIBUTION PERFORMED - ${plan.totalAmount} tokens saved for next cycle`);
        
        return {
          success: true,  // Not a failure, just deferred
          distributed: 0,
          recipients: 0,
          txSignatures: [],
          failed: [],
          undistributedAmount: plan.totalAmount,
          error: 'No eligible holders - funds saved for next distribution'
        };
      }

      // Execute distribution (mock implementation)
      if (this.config.adapters.birdeye === 'MockBirdeyeAdapter') {
        const result = await this.mockDistribution(plan);
        
        // If successful, clear undistributed balance
        if (result.success && plan.undistributedFromPrevious > 0) {
          logger.info(`Successfully distributed ${plan.undistributedFromPrevious} previously undistributed tokens`);
          this.undistributedBalance = 0;
          this.undistributedToken = null;
          await this.saveUndistributedBalance();
        }
        
        return result;
      }

      // Real implementation would handle actual token transfers
      throw new Error('Real distribution not implemented in mock phase');

    } catch (error) {
      logger.error('Distribution execution failed', { error });
      
      // On failure, update undistributed balance
      this.undistributedBalance = plan.totalAmount;
      this.undistributedToken = plan.rewardToken;
      this.lastUndistributedUpdate = Date.now();
      await this.saveUndistributedBalance();
      
      return {
        success: false,
        distributed: totalDistributed,
        recipients: recipientCount,
        txSignatures,
        failed,
        undistributedAmount: plan.totalAmount,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Emergency withdrawal of undistributed funds
   * This should only be called by authorized personnel
   */
  async emergencyWithdrawUndistributed(
    destinationWallet: PublicKey
  ): Promise<{ success: boolean; amount: number; txSignature?: string; error?: string }> {
    try {
      if (this.undistributedBalance === 0) {
        return {
          success: false,
          amount: 0,
          error: 'No undistributed balance to withdraw'
        };
      }

      logger.warn(`EMERGENCY WITHDRAWAL: ${this.undistributedBalance} tokens to ${destinationWallet.toBase58()}`);
      
      // TODO: Implement actual withdrawal logic
      // This would transfer tokens from keeper/treasury to destination wallet
      
      // For now, simulate withdrawal
      const amount = this.undistributedBalance;
      const token = this.undistributedToken;
      
      // Clear undistributed balance
      this.undistributedBalance = 0;
      this.undistributedToken = null;
      this.lastUndistributedUpdate = Date.now();
      await this.saveUndistributedBalance();
      
      logger.info(`Emergency withdrawal completed: ${amount} ${token?.toBase58()} tokens`);
      
      return {
        success: true,
        amount,
        txSignature: 'mock-emergency-withdrawal-tx'
      };
      
    } catch (error) {
      logger.error('Emergency withdrawal failed', { error });
      return {
        success: false,
        amount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Mock distribution implementation
   */
  private async mockDistribution(plan: DistributionPlan): Promise<DistributionResult> {
    const batchSize = 10;
    const batches = Math.ceil(plan.eligibleHolders.length / batchSize);
    const txSignatures: string[] = [];
    const failed: DistributionResult['failed'] = [];

    logger.info(`[MOCK] Processing ${plan.eligibleHolders.length} recipients in ${batches} batches`);
    if (plan.undistributedFromPrevious > 0) {
      logger.info(`[MOCK] Including ${plan.undistributedFromPrevious} tokens from previous failed distribution`);
    }

    let totalDistributed = 0;
    let recipientCount = 0;

    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, plan.eligibleHolders.length);
      const batchRecipients = plan.eligibleHolders.slice(start, end);
      
      // Simulate 5% failure rate
      const shouldFail = Math.random() < 0.05;
      
      if (shouldFail && i > 0) {
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

  // ... rest of the methods remain the same ...
  
  addExclusion(address: string): void {
    this.rewardExclusions.add(address);
    logger.info(`Added ${address} to exclusion list`);
  }

  removeExclusion(address: string): void {
    this.rewardExclusions.delete(address);
    logger.info(`Removed ${address} from exclusion list`);
  }

  getExclusions(): string[] {
    return Array.from(this.rewardExclusions);
  }

  validateDistribution(
    amount: number,
    recipientCount: number
  ): { valid: boolean; reason?: string } {
    if (amount <= 0) {
      return { valid: false, reason: 'Amount must be positive' };
    }

    // Allow 0 recipients (will be saved for later)
    if (recipientCount === 0) {
      return { valid: true };  // Valid - will be saved as undistributed
    }

    const minPerRecipient = 0.000001;
    const avgPerRecipient = amount / recipientCount;
    
    if (avgPerRecipient < minPerRecipient) {
      return { valid: false, reason: 'Amount too small for recipient count' };
    }

    return { valid: true };
  }

  getStatus(): {
    minUsdValue: number;
    exclusionCount: number;
    rewardToken: PublicKey | null;
    undistributedBalance: number;
    undistributedToken: PublicKey | null;
  } {
    return {
      minUsdValue: this.minUsdValue,
      exclusionCount: this.rewardExclusions.size,
      rewardToken: null,
      undistributedBalance: this.undistributedBalance,
      undistributedToken: this.undistributedToken
    };
  }

  reset(): void {
    this.rewardExclusions.clear();
    this.initializeExclusions();
    this.undistributedBalance = 0;
    this.undistributedToken = null;
    this.lastUndistributedUpdate = 0;
    logger.info('DistributionEngineV2 reset');
  }
}