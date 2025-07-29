import { Connection, PublicKey } from '@solana/web3.js';
import { createLogger } from '../utils/logger';
import { Config } from '../config/config';
import { IJupiterAdapter, SwapParams, SwapQuote, SwapResult } from '../interfaces/IJupiterAdapter';

const logger = createLogger('SwapManager');

export interface TaxSplitResult {
  ownerAmount: number;
  holdersAmount: number;
  keeperTopUp: number;
}

export interface SwapPlan {
  scenario: 'SOL_REWARD_LOW_KEEPER' | 'SOL_REWARD_NORMAL' | 'TOKEN_REWARD_LOW_KEEPER' | 'TOKEN_REWARD_NORMAL';
  keeperBalance: number;
  rewardToken: PublicKey;
  taxAmount: number;
  splits: TaxSplitResult;
  swapsNeeded: Array<{
    from: PublicKey;
    to: PublicKey;
    amount: number;
    purpose: 'keeper_topup' | 'owner_payment' | 'holder_rewards';
  }>;
}

export interface SwapExecutionResult {
  success: boolean;
  swapsExecuted: SwapResult[];
  swapsFailed: Array<{ swap: any; error: string }>;
  finalSplits: TaxSplitResult;
  rollbackNeeded: boolean;
  error?: string;
}

export class SwapManager {
  private connection: Connection;
  private config: Config;
  private jupiterAdapter: IJupiterAdapter;
  private keeperWallet: PublicKey;
  private ownerWallet: PublicKey;
  private solMint = new PublicKey('So11111111111111111111111111111111111111112');
  private mikoMint = new PublicKey('A9xZnPo2SvSgWiSxh4XApZyjyYRcH1ES8zTCvhzogYRE');

  constructor(
    connection: Connection,
    config: Config,
    jupiterAdapter: IJupiterAdapter,
    ownerWallet: PublicKey
  ) {
    this.connection = connection;
    this.config = config;
    this.jupiterAdapter = jupiterAdapter;
    this.keeperWallet = new PublicKey(config.keeper.wallet_pubkey);
    this.ownerWallet = ownerWallet;
  }

  /**
   * Create swap plan based on tax flow scenarios
   * @param mikoAmount - Amount of MIKO tokens harvested (in smallest units)
   * @param rewardToken - The token to distribute as rewards
   * @param keeperBalance - Current keeper SOL balance
   */
  async createSwapPlan(
    mikoAmount: number,
    rewardToken: PublicKey,
    keeperBalance: number
  ): Promise<SwapPlan> {
    const isRewardSol = rewardToken.equals(this.solMint);
    const minKeeperSol = this.config.keeper.min_sol_balance;
    const maxKeeperSol = this.config.keeper.max_sol_balance;
    
    // Calculate base splits (20% owner, 80% holders)
    // Use integer math to avoid floating point errors
    const ownerShareBps = 2000; // 20% in basis points
    const holderShareBps = 8000; // 80% in basis points
    const totalBps = 10000;
    
    const ownerShareMiko = (mikoAmount * ownerShareBps) / totalBps;
    const holderShareMiko = (mikoAmount * holderShareBps) / totalBps;

    let scenario: SwapPlan['scenario'];
    let splits: TaxSplitResult;
    const swapsNeeded: SwapPlan['swapsNeeded'] = [];

    if (isRewardSol) {
      // Need to swap MIKO to SOL
      swapsNeeded.push({
        from: this.mikoMint,
        to: this.solMint,
        amount: mikoAmount,
        purpose: 'holder_rewards' // Will be split after swap
      });
      
      if (keeperBalance < minKeeperSol) {
        // Scenario 1: Reward is SOL, keeper needs top-up
        scenario = 'SOL_REWARD_LOW_KEEPER';
        
        // We'll need to estimate SOL output from MIKO swap
        // For now, use a placeholder conversion rate
        const estimatedSolOutput = mikoAmount * 0.0001; // Placeholder: 1 MIKO = 0.0001 SOL
        const ownerShareSol = (estimatedSolOutput * ownerShareBps) / totalBps;
        const holderShareSol = (estimatedSolOutput * holderShareBps) / totalBps;
        
        const keeperDeficit = maxKeeperSol - keeperBalance;
        const keeperNeeded = Math.min(ownerShareSol, keeperDeficit);
        const ownerRemaining = ownerShareSol - keeperNeeded;
        
        splits = {
          ownerAmount: ownerRemaining,
          holdersAmount: holderShareSol,
          keeperTopUp: keeperNeeded
        };

        logger.info(`Tax flow scenario: SOL reward, low keeper balance`);
        logger.info(`Keeper top-up: ${keeperNeeded} SOL`);
        logger.info(`Owner receives: ${ownerRemaining} SOL`);
        logger.info(`Holders receive: ${holderShareSol} SOL`);

      } else {
        // Scenario 2: Reward is SOL, keeper balance normal
        scenario = 'SOL_REWARD_NORMAL';
        
        // Estimate SOL output
        const estimatedSolOutput = mikoAmount * 0.0001; // Placeholder
        const ownerShareSol = (estimatedSolOutput * ownerShareBps) / totalBps;
        const holderShareSol = (estimatedSolOutput * holderShareBps) / totalBps;
        
        splits = {
          ownerAmount: ownerShareSol,
          holdersAmount: holderShareSol,
          keeperTopUp: 0
        };

        logger.info(`Tax flow scenario: SOL reward, normal keeper balance`);
        logger.info(`Swapping ${mikoAmount} MIKO to SOL`);
        logger.info(`Estimated owner receives: ${ownerShareSol} SOL`);
        logger.info(`Estimated holders receive: ${holderShareSol} SOL`);
      }
    } else {
      if (keeperBalance < minKeeperSol) {
        // Scenario 3: Reward is not SOL, keeper needs top-up
        scenario = 'TOKEN_REWARD_LOW_KEEPER';
        
        // First swap owner's MIKO portion to SOL for keeper
        swapsNeeded.push({
          from: this.mikoMint,
          to: this.solMint,
          amount: ownerShareMiko,
          purpose: 'keeper_topup'
        });

        // Then swap holder's MIKO portion to reward token
        swapsNeeded.push({
          from: this.mikoMint,
          to: rewardToken,
          amount: holderShareMiko,
          purpose: 'holder_rewards'
        });

        // Estimate SOL output for keeper calculation
        const estimatedSolFromOwnerShare = ownerShareMiko * 0.0001;
        const keeperDeficit = maxKeeperSol - keeperBalance;
        const keeperNeeded = Math.min(estimatedSolFromOwnerShare, keeperDeficit);
        const ownerRemaining = estimatedSolFromOwnerShare - keeperNeeded;

        splits = {
          ownerAmount: ownerRemaining,
          holdersAmount: holderShareMiko, // This will be in reward tokens after swap
          keeperTopUp: keeperNeeded
        };

        logger.info(`Tax flow scenario: Token reward, low keeper balance`);
        logger.info(`Swapping ${ownerShareMiko} MIKO to SOL for keeper/owner`);
        logger.info(`Swapping ${holderShareMiko} MIKO to ${rewardToken.toBase58()} for holders`);

      } else {
        // Scenario 4: Reward is not SOL, keeper balance normal
        scenario = 'TOKEN_REWARD_NORMAL';
        
        // Swap all MIKO to reward token
        swapsNeeded.push({
          from: this.mikoMint,
          to: rewardToken,
          amount: mikoAmount,
          purpose: 'holder_rewards'
        });

        splits = {
          ownerAmount: ownerShareMiko, // Will be in reward tokens
          holdersAmount: holderShareMiko, // Will be in reward tokens
          keeperTopUp: 0
        };

        logger.info(`Tax flow scenario: Token reward, normal keeper balance`);
        logger.info(`Swapping ${mikoAmount} MIKO to ${rewardToken.toBase58()}`);
      }
    }

    return {
      scenario,
      keeperBalance,
      rewardToken,
      taxAmount: mikoAmount,
      splits,
      swapsNeeded
    };
  }

  /**
   * Execute swaps according to plan
   */
  async executeSwapPlan(plan: SwapPlan): Promise<SwapExecutionResult> {
    const swapsExecuted: SwapResult[] = [];
    const swapsFailed: Array<{ swap: any; error: string }> = [];
    let rollbackNeeded = false;

    try {
      logger.info(`Executing swap plan: ${plan.scenario}`);

      for (const swap of plan.swapsNeeded) {
        try {
          logger.info(`Executing swap: ${swap.amount} ${swap.from.toBase58()} → ${swap.to.toBase58()}`);

          // Get quote
          const quote = await this.jupiterAdapter.getQuote({
            inputMint: swap.from,
            outputMint: swap.to,
            amount: swap.amount,
            slippageBps: this.config.apis.jupiter.slippage_bps,
            userPublicKey: this.keeperWallet
          });

          // Check if quote meets minimum output requirements
          // Jupiter already calculates slippage in the quote
          if (quote.priceImpactPct > 5) {
            throw new Error(`Price impact too high: ${quote.priceImpactPct.toFixed(2)}%`);
          }

          // Execute swap
          const result = await this.jupiterAdapter.swap(quote, this.keeperWallet);
          swapsExecuted.push(result);

          logger.info(`Swap successful: ${result.txid}`);

        } catch (error) {
          logger.error(`Swap failed`, { swap, error });
          swapsFailed.push({
            swap,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          // If any swap fails, we need rollback
          rollbackNeeded = true;
          break;
        }
      }

      if (rollbackNeeded) {
        logger.warn('Swap plan execution failed, rollback needed');
        return {
          success: false,
          swapsExecuted,
          swapsFailed,
          finalSplits: plan.splits,
          rollbackNeeded: true,
          error: `Swap failed: ${swapsFailed[0]?.error || 'Unknown error'}`
        };
      }

      logger.info('All swaps executed successfully');
      return {
        success: true,
        swapsExecuted,
        swapsFailed,
        finalSplits: plan.splits,
        rollbackNeeded: false
      };

    } catch (error) {
      logger.error('Swap plan execution failed', { error });
      return {
        success: false,
        swapsExecuted,
        swapsFailed,
        finalSplits: plan.splits,
        rollbackNeeded: true,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Rollback executed swaps (best effort - may incur losses)
   */
  async rollbackSwaps(swapsToRollback: SwapResult[]): Promise<boolean> {
    logger.warn(`Attempting to rollback ${swapsToRollback.length} swaps`);

    try {
      // In production, rollback is challenging due to:
      // 1. Price movements between original swap and rollback
      // 2. Additional fees incurred
      // 3. Potential liquidity changes
      
      // Best practice: Design system to avoid needing rollbacks
      // by validating all conditions before executing swaps
      
      for (const swap of swapsToRollback.reverse()) {
        try {
          // Reverse the swap direction
          const reverseQuote = await this.jupiterAdapter.getQuote({
            inputMint: swap.outputMint,
            outputMint: swap.inputMint,
            amount: swap.outAmount,
            slippageBps: 500, // Higher slippage for emergency rollback
            userPublicKey: this.keeperWallet
          });
          
          await this.jupiterAdapter.swap(reverseQuote, this.keeperWallet);
          logger.info(`Rolled back swap: ${swap.txid}`);
          
        } catch (error) {
          logger.error(`Failed to rollback swap ${swap.txid}`, { error });
          // Continue with other rollbacks even if one fails
        }
      }
      
      return true;

    } catch (error) {
      logger.error('Rollback failed', { error });
      return false;
    }
  }

  /**
   * Calculate keeper SOL balance
   */
  async getKeeperBalance(): Promise<number> {
    try {
      // In mock mode, return configured balance
      if (this.config.adapters.jupiter === 'MockJupiterAdapter') {
        return this.config.test_data.keeper_balance;
      }

      const balance = await this.connection.getBalance(this.keeperWallet);
      return balance / 1e9; // Convert lamports to SOL

    } catch (error) {
      logger.error('Failed to get keeper balance', { error });
      return 0;
    }
  }

  /**
   * Validate swap parameters
   */
  validateSwapParams(params: SwapParams): { valid: boolean; reason?: string } {
    // Check minimum amount
    const minSwapAmount = 0.001; // 0.001 SOL minimum
    if (params.amount < minSwapAmount * 1e9) {
      return { valid: false, reason: 'Amount too small' };
    }

    // Check slippage bounds
    if (params.slippageBps < 10 || params.slippageBps > 1000) {
      return { valid: false, reason: 'Invalid slippage (0.1% - 10% allowed)' };
    }

    return { valid: true };
  }

  /**
   * Get status
   */
  getStatus(): {
    keeperWallet: PublicKey;
    ownerWallet: PublicKey;
    minKeeperSol: number;
    maxKeeperSol: number;
    slippageBps: number;
  } {
    return {
      keeperWallet: this.keeperWallet,
      ownerWallet: this.ownerWallet,
      minKeeperSol: this.config.keeper.min_sol_balance,
      maxKeeperSol: this.config.keeper.max_sol_balance,
      slippageBps: this.config.apis.jupiter.slippage_bps
    };
  }
}