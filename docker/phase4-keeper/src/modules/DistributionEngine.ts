import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { 
  getAssociatedTokenAddressSync, 
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { createLogger } from '../utils/logger';
import { Phase4BConfig } from '../config/config';
import { MockBirdeyeAdapter } from './mock-birdeye-adapter';
import * as fs from 'fs';

const logger = createLogger('DistributionEngine');

export interface DistributionPlan {
  totalAmount: number;
  rewardToken: PublicKey;
  rewardTokenIsSOL: boolean;
  recipients: Array<{
    address: PublicKey;
    amount: number;
    holding: number;
    valueUsd: number;
  }>;
  rolloverAmount: number;
  noEligibleHolders: boolean;
}

export interface DistributionResult {
  success: boolean;
  distributed: number;
  recipients: number;
  failed: number;
  rollover: number;
  txSignatures?: string[];
  error?: string;
}

// Track undistributed amounts across harvests (per PLAN.md rollover mechanism)
interface RolloverState {
  amount: number;
  token: string;
  lastUpdate: number;
}

export class DistributionEngine {
  private connection: Connection;
  private config: Phase4BConfig;
  private birdeyeAdapter: MockBirdeyeAdapter;
  private keeper: Keypair;
  private mikoMint: PublicKey;
  private rolloverState: RolloverState = { amount: 0, token: '', lastUpdate: 0 };
  private rolloverFilePath = './rollover-state.json';
  private dynamicExclusionManager?: DynamicExclusionManager;

  constructor(connection: Connection, config: Phase4BConfig) {
    this.connection = connection;
    this.config = config;
    this.birdeyeAdapter = new MockBirdeyeAdapter(connection);
    this.mikoMint = new PublicKey(config.token.mint_address);
    
    // CRITICAL BUG: Using deployer keypair because vault was initialized incorrectly
    // See DEVELOPMENT_STATUS.md Issue 3 & 4 for details
    // This SHOULD use keeper keypair, but vault's keeper_authority is set to deployer
    // ALL modules must use the same keypair to avoid distribution failures
    const deployerData = JSON.parse(fs.readFileSync('../phase4b-deployer.json', 'utf-8'));
    this.keeper = Keypair.fromSecretKey(new Uint8Array(deployerData));
    
    // Load rollover state if exists
    this.loadRolloverState();
  }
  
  // Set the dynamic exclusion manager (passed from keeper bot)
  setDynamicExclusionManager(manager: DynamicExclusionManager): void {
    this.dynamicExclusionManager = manager;
  }

  private loadRolloverState(): void {
    try {
      if (fs.existsSync(this.rolloverFilePath)) {
        this.rolloverState = JSON.parse(fs.readFileSync(this.rolloverFilePath, 'utf-8'));
        logger.info('Loaded rollover state', this.rolloverState);
      }
    } catch (error) {
      logger.warn('Failed to load rollover state, starting fresh', { error });
    }
  }
  
  private saveRolloverState(): void {
    try {
      fs.writeFileSync(this.rolloverFilePath, JSON.stringify(this.rolloverState, null, 2));
      logger.debug('Saved rollover state');
    } catch (error) {
      logger.error('Failed to save rollover state', { error });
    }
  }

  async createDistributionPlan(
    amount: number,
    rewardToken: PublicKey
  ): Promise<DistributionPlan> {
    try {
      const rewardTokenIsSOL = rewardToken.equals(new PublicKey('So11111111111111111111111111111111111111112'));
      
      // Include any rollover from previous harvest
      let totalToDistribute = amount;
      if (this.rolloverState.amount > 0 && this.rolloverState.token === rewardToken.toBase58()) {
        totalToDistribute += this.rolloverState.amount;
        logger.info('Including rollover from previous harvest', {
          rollover: this.rolloverState.amount / 1e9,
          total: totalToDistribute / 1e9
        });
      }
      
      logger.info('Creating distribution plan', { 
        newAmount: amount / 1e9,
        totalAmount: totalToDistribute / 1e9,
        rewardToken: rewardToken.toBase58(),
        isSOL: rewardTokenIsSOL
      });
      
      // Update dynamic exclusions before distribution
      if (this.dynamicExclusionManager) {
        logger.info('Updating pool exclusions before distribution...');
        await this.dynamicExclusionManager.updateExclusionsBeforeDistribution();
      } else {
        logger.warn('DynamicExclusionManager not set - pool detection skipped');
      }
      
      // Get reward exclusions from vault (should include system accounts)
      const rewardExclusions = await this.getRewardExclusions();
      
      // Get eligible holders using mock Birdeye adapter
      const holdersResult = await this.birdeyeAdapter.getEligibleHolders(
        this.mikoMint,
        rewardExclusions
      );
      
      if (holdersResult.eligibleHolders === 0) {
        logger.warn('No eligible holders found - all funds will rollover', {
          totalHolders: holdersResult.totalHolders,
          minValueUsd: holdersResult.minValueUsd,
          tokenPrice: holdersResult.tokenPrice
        });
        
        // Update rollover state
        this.rolloverState = {
          amount: totalToDistribute,
          token: rewardToken.toBase58(),
          lastUpdate: Date.now()
        };
        this.saveRolloverState();
        
        return {
          totalAmount: totalToDistribute,
          rewardToken,
          rewardTokenIsSOL,
          recipients: [],
          rolloverAmount: totalToDistribute,
          noEligibleHolders: true
        };
      }
      
      // Calculate proportional distribution
      const totalHoldings = holdersResult.holders.reduce((sum, h) => sum + h.amount, 0);
      
      const recipients = holdersResult.holders.map(holder => {
        const proportion = holder.amount / totalHoldings;
        const distributionAmount = Math.floor(totalToDistribute * proportion);
        
        return {
          address: new PublicKey(holder.address),
          amount: distributionAmount,
          holding: holder.amount,
          valueUsd: holder.valueUsd
        };
      });
      
      // Calculate any rounding remainder as rollover
      const distributed = recipients.reduce((sum, r) => sum + r.amount, 0);
      const rolloverAmount = totalToDistribute - distributed;
      
      // Reset rollover state since we're distributing
      this.rolloverState = {
        amount: rolloverAmount,
        token: rewardToken.toBase58(),
        lastUpdate: Date.now()
      };
      this.saveRolloverState();
      
      logger.info('Distribution plan created', {
        eligibleHolders: recipients.length,
        totalToDistribute: totalToDistribute / 1e9,
        distributed: distributed / 1e9,
        rollover: rolloverAmount / 1e9
      });
      
      return {
        totalAmount: totalToDistribute,
        rewardToken,
        rewardTokenIsSOL,
        recipients,
        rolloverAmount,
        noEligibleHolders: false
      };
    } catch (error) {
      logger.error('Failed to create distribution plan', { error });
      throw error;
    }
  }
  
  private async getRewardExclusions(): Promise<PublicKey[]> {
    // In production, this would query the vault program for the reward_exclusions list
    // For now, return known system accounts that should be excluded
    return [
      new PublicKey(this.config.pdas.vault_pda), // Vault PDA
      this.keeper.publicKey, // Keeper
      new PublicKey(this.config.wallets.owner_wallet), // Owner (gets separate 20%)
      this.mikoMint, // Token mint
      // Smart dial PDA would also be excluded
      
      // MANUAL EXCLUSION FOR TESTING - Pool vault with 719M MIKO
      new PublicKey('GpMZbSM2dRcJqyDmE2ueBxvsrfFjqNkr5kJQxNF86VCe'),
    ];
  }

  async executeDistribution(plan: DistributionPlan): Promise<DistributionResult> {
    try {
      if (plan.noEligibleHolders) {
        logger.warn('No eligible holders - nothing to distribute');
        return {
          success: true,
          distributed: 0,
          recipients: 0,
          failed: 0,
          rollover: plan.rolloverAmount,
          txSignatures: [],
        };
      }
      
      logger.info('Executing distribution', {
        recipients: plan.recipients.length,
        totalAmount: plan.totalAmount / 1e9,
        rewardToken: plan.rewardToken.toBase58(),
        isSOL: plan.rewardTokenIsSOL
      });
      
      const txSignatures: string[] = [];
      let successCount = 0;
      let failedCount = 0;
      let totalDistributed = 0;
      
      // Process in batches to avoid transaction size limits
      const BATCH_SIZE = 5;
      for (let i = 0; i < plan.recipients.length; i += BATCH_SIZE) {
        const batch = plan.recipients.slice(i, i + BATCH_SIZE);
        
        try {
          const tx = new Transaction();
          
          for (const recipient of batch) {
            if (plan.rewardTokenIsSOL) {
              // Transfer native SOL
              tx.add(
                SystemProgram.transfer({
                  fromPubkey: this.keeper.publicKey,
                  toPubkey: recipient.address,
                  lamports: recipient.amount,
                })
              );
            } else {
              // Transfer SPL token
              const recipientAta = getAssociatedTokenAddressSync(
                plan.rewardToken,
                recipient.address,
                false,
                plan.rewardToken.equals(this.mikoMint) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
              );
              
              const keeperAta = getAssociatedTokenAddressSync(
                plan.rewardToken,
                this.keeper.publicKey,
                false,
                plan.rewardToken.equals(this.mikoMint) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
              );
              
              // Check if recipient ATA exists, create if not
              const ataInfo = await this.connection.getAccountInfo(recipientAta);
              if (!ataInfo) {
                tx.add(
                  createAssociatedTokenAccountInstruction(
                    this.keeper.publicKey,
                    recipientAta,
                    recipient.address,
                    plan.rewardToken,
                    plan.rewardToken.equals(this.mikoMint) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
                  )
                );
              }
              
              // Add transfer instruction
              tx.add(
                createTransferInstruction(
                  keeperAta,
                  recipientAta,
                  this.keeper.publicKey,
                  recipient.amount,
                  [],
                  plan.rewardToken.equals(this.mikoMint) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
                )
              );
            }
          }
          
          // Send transaction
          const { blockhash } = await this.connection.getLatestBlockhash();
          tx.recentBlockhash = blockhash;
          tx.feePayer = this.keeper.publicKey;
          
          const signature = await this.connection.sendTransaction(tx, [this.keeper]);
          await this.connection.confirmTransaction(signature);
          
          txSignatures.push(signature);
          successCount += batch.length;
          totalDistributed += batch.reduce((sum, r) => sum + r.amount, 0);
          
          logger.info(`Distributed to batch ${i / BATCH_SIZE + 1}`, {
            recipients: batch.length,
            signature: signature.substring(0, 8) + '...'
          });
          
        } catch (error) {
          logger.error(`Failed to distribute batch ${i / BATCH_SIZE + 1}`, { error });
          failedCount += batch.length;
        }
      }
      
      logger.info('Distribution complete', {
        success: successCount,
        failed: failedCount,
        distributed: totalDistributed / 1e9,
        rollover: plan.rolloverAmount / 1e9
      });
      
      return {
        success: failedCount === 0,
        distributed: totalDistributed,
        recipients: successCount,
        failed: failedCount,
        rollover: plan.rolloverAmount,
        txSignatures,
      };
      
    } catch (error) {
      logger.error('Distribution execution failed', { error });
      return {
        success: false,
        distributed: 0,
        recipients: 0,
        failed: plan.recipients.length,
        rollover: plan.totalAmount,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getStatus(): any {
    return {
      rolloverState: this.rolloverState,
      mockPrice: this.birdeyeAdapter['mockPriceUsd'],
      minHolderValueUsd: 100,
      isUsingMockAdapter: true,
      note: 'Using mock Birdeye adapter for local fork testing'
    };
  }
  
  // Helper for testing - set mock price
  setMockPrice(priceUsd: number): void {
    this.birdeyeAdapter.setMockPrice(priceUsd);
  }
}