import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, getAccount, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createLogger } from '../utils/logger';
import { Phase4BConfig } from '../config/config';
import { JupiterAdapter } from './jupiter-adapter';
import * as fs from 'fs';

const logger = createLogger('SwapManager');

const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const MIN_KEEPER_SOL = 0.05;
const TARGET_KEEPER_SOL = 0.10;

export interface SwapPlan {
  totalMiko: number;
  rewardToken: PublicKey;
  rewardTokenIsSOL: boolean;
  keeperNeedsTopUp: boolean;
  keeperBalance: number;
  
  // Detailed swap instructions based on tax flow scenarios
  swaps: {
    // For owner's 20%
    ownerPortion: {
      mikoAmount: number;
      action: 'keep_as_miko' | 'swap_to_sol' | 'swap_to_reward_token';
      keeperTopUpAmount?: number;  // If some goes to keeper
      ownerReceiveAmount?: number;  // What owner actually gets
    };
    // For holders' 80%
    holdersPortion: {
      mikoAmount: number;
      action: 'keep_as_miko' | 'swap_to_sol' | 'swap_to_reward_token';
    };
  };
}

export interface SwapResult {
  success: boolean;
  swapsExecuted: string[];
  finalAmounts: {
    ownerReceived: number;      // Amount owner actually received
    holdersReceived: number;    // Amount for distribution to holders
    keeperTopUp: number;        // Amount used for keeper top-up
    ownerToken: string;         // Token type owner received
    holdersToken: string;       // Token type for holders
  };
  error?: string;
}

export class SwapManager {
  private connection: Connection;
  private config: Phase4BConfig;
  private ownerWallet: PublicKey;
  private jupiterAdapter: JupiterAdapter;
  private mikoMint: PublicKey;
  private keeper: Keypair;

  constructor(connection: Connection, config: Phase4BConfig) {
    this.connection = connection;
    this.config = config;
    this.ownerWallet = new PublicKey(config.wallets.owner_wallet);
    // Pass pool ID to JupiterAdapter for Raydium fallback
    const poolId = config.pool?.pool_id ? new PublicKey(config.pool.pool_id) : undefined;
    this.jupiterAdapter = new JupiterAdapter(connection, poolId);
    this.mikoMint = new PublicKey(config.token.mint_address);
    
    // CRITICAL BUG: Using deployer keypair because vault was initialized incorrectly
    // See DEVELOPMENT_STATUS.md Issue 3 for details
    const deployerData = JSON.parse(fs.readFileSync('../phase4b-deployer.json', 'utf-8'));
    this.keeper = Keypair.fromSecretKey(new Uint8Array(deployerData));
  }

  async getKeeperBalance(): Promise<number> {
    try {
      const balance = await this.connection.getBalance(this.keeper.publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      logger.error('Failed to get keeper balance', { error });
      return 0;
    }
  }

  async createSwapPlan(
    totalMiko: number,
    rewardToken: PublicKey,
    keeperBalance: number
  ): Promise<SwapPlan> {
    const ownerAmount = Math.floor(totalMiko * 0.2);  // 20%
    const holdersAmount = totalMiko - ownerAmount;    // 80%
    
    const rewardTokenIsSOL = rewardToken.equals(SOL_MINT);
    const keeperNeedsTopUp = keeperBalance < MIN_KEEPER_SOL;
    
    logger.info('Creating swap plan based on tax flow scenarios', {
      totalMiko: totalMiko / 1e9,
      rewardToken: rewardToken.toBase58(),
      rewardTokenIsSOL,
      keeperBalance,
      keeperNeedsTopUp,
    });
    
    let plan: SwapPlan;
    
    if (rewardTokenIsSOL) {
      // Scenario 1: Reward token is SOL
      if (keeperNeedsTopUp) {
        // Keep all tax as SOL, use up to 20% for keeper top-up
        const keeperNeeded = TARGET_KEEPER_SOL - keeperBalance;
        const keeperTopUpAmount = Math.min(ownerAmount, keeperNeeded * 1e9); // Convert SOL to lamports equivalent
        const ownerReceiveAmount = ownerAmount - keeperTopUpAmount;
        
        plan = {
          totalMiko,
          rewardToken,
          rewardTokenIsSOL,
          keeperNeedsTopUp,
          keeperBalance,
          swaps: {
            ownerPortion: {
              mikoAmount: ownerAmount,
              action: 'swap_to_sol',
              keeperTopUpAmount,
              ownerReceiveAmount,
            },
            holdersPortion: {
              mikoAmount: holdersAmount,
              action: 'swap_to_sol',
            },
          },
        };
      } else {
        // Normal distribution: 20% to owner, 80% to holders (all in SOL)
        plan = {
          totalMiko,
          rewardToken,
          rewardTokenIsSOL,
          keeperNeedsTopUp,
          keeperBalance,
          swaps: {
            ownerPortion: {
              mikoAmount: ownerAmount,
              action: 'swap_to_sol',
              ownerReceiveAmount: ownerAmount,
            },
            holdersPortion: {
              mikoAmount: holdersAmount,
              action: 'swap_to_sol',
            },
          },
        };
      }
    } else {
      // Scenario 2: Reward token is NOT SOL
      if (keeperNeedsTopUp) {
        // Swap 20% to SOL for keeper/owner, swap 80% to reward token
        const keeperNeeded = TARGET_KEEPER_SOL - keeperBalance;
        const keeperTopUpAmount = Math.min(ownerAmount, keeperNeeded * 1e9);
        const ownerReceiveAmount = ownerAmount - keeperTopUpAmount;
        
        plan = {
          totalMiko,
          rewardToken,
          rewardTokenIsSOL,
          keeperNeedsTopUp,
          keeperBalance,
          swaps: {
            ownerPortion: {
              mikoAmount: ownerAmount,
              action: 'swap_to_sol',
              keeperTopUpAmount,
              ownerReceiveAmount,
            },
            holdersPortion: {
              mikoAmount: holdersAmount,
              action: 'swap_to_reward_token',
            },
          },
        };
      } else {
        // Swap all to reward token, distribute 20% value to owner, 80% to holders
        plan = {
          totalMiko,
          rewardToken,
          rewardTokenIsSOL,
          keeperNeedsTopUp,
          keeperBalance,
          swaps: {
            ownerPortion: {
              mikoAmount: ownerAmount,
              action: 'swap_to_reward_token',
              ownerReceiveAmount: ownerAmount,
            },
            holdersPortion: {
              mikoAmount: holdersAmount,
              action: 'swap_to_reward_token',
            },
          },
        };
      }
    }
    
    logger.info('Swap plan created', plan);
    return plan;
  }

  async executeSwapPlan(plan: SwapPlan): Promise<SwapResult> {
    try {
      logger.info('Executing swap plan');
      
      const swapsExecuted: string[] = [];
      let ownerReceived = 0;
      let holdersReceived = 0;
      let keeperTopUp = 0;
      let ownerToken = 'MIKO';
      let holdersToken = 'MIKO';
      
      // Execute owner portion swap
      if (plan.swaps.ownerPortion.action === 'swap_to_sol') {
        logger.info('Swapping owner portion to SOL', {
          amount: plan.swaps.ownerPortion.mikoAmount / 1e9
        });
        
        const swapResult = await this.jupiterAdapter.swapMikoToSol(
          this.keeper,
          this.mikoMint,
          plan.swaps.ownerPortion.mikoAmount,
          100 // 1% slippage
        );
        
        if (!swapResult.success) {
          throw new Error(`Owner swap to SOL failed: ${swapResult.error}`);
        }
        
        swapsExecuted.push(swapResult.txSignature!);
        const solReceived = swapResult.outputAmount;
        ownerToken = 'SOL';
        
        // Handle keeper top-up if needed
        if (plan.swaps.ownerPortion.keeperTopUpAmount && plan.swaps.ownerPortion.keeperTopUpAmount > 0) {
          keeperTopUp = Math.min(solReceived, plan.swaps.ownerPortion.keeperTopUpAmount);
          ownerReceived = solReceived - keeperTopUp;
          logger.info('Keeper top-up from owner portion', {
            keeperTopUp: keeperTopUp / 1e9,
            ownerReceived: ownerReceived / 1e9
          });
        } else {
          ownerReceived = solReceived;
        }
        
        // Transfer SOL to owner if any remaining
        if (ownerReceived > 0) {
          // Transfer will be handled by distribution engine
          logger.info('Owner will receive SOL', { amount: ownerReceived / 1e9 });
        }
        
      } else if (plan.swaps.ownerPortion.action === 'swap_to_reward_token') {
        logger.info('Swapping owner portion to reward token', {
          amount: plan.swaps.ownerPortion.mikoAmount / 1e9,
          rewardToken: plan.rewardToken.toBase58()
        });
        
        const swapResult = await this.jupiterAdapter.swapMikoToRewardToken(
          this.keeper,
          this.mikoMint,
          plan.rewardToken,
          plan.swaps.ownerPortion.mikoAmount,
          100
        );
        
        if (!swapResult.success) {
          throw new Error(`Owner swap to reward token failed: ${swapResult.error}`);
        }
        
        swapsExecuted.push(swapResult.txSignature!);
        ownerReceived = swapResult.outputAmount;
        ownerToken = plan.rewardToken.toBase58();
      }
      
      // Execute holders portion swap
      if (plan.swaps.holdersPortion.action === 'swap_to_sol') {
        logger.info('Swapping holders portion to SOL', {
          amount: plan.swaps.holdersPortion.mikoAmount / 1e9
        });
        
        const swapResult = await this.jupiterAdapter.swapMikoToSol(
          this.keeper,
          this.mikoMint,
          plan.swaps.holdersPortion.mikoAmount,
          100
        );
        
        if (!swapResult.success) {
          throw new Error(`Holders swap to SOL failed: ${swapResult.error}`);
        }
        
        swapsExecuted.push(swapResult.txSignature!);
        holdersReceived = swapResult.outputAmount;
        holdersToken = 'SOL';
        
      } else if (plan.swaps.holdersPortion.action === 'swap_to_reward_token') {
        logger.info('Swapping holders portion to reward token', {
          amount: plan.swaps.holdersPortion.mikoAmount / 1e9,
          rewardToken: plan.rewardToken.toBase58()
        });
        
        const swapResult = await this.jupiterAdapter.swapMikoToRewardToken(
          this.keeper,
          this.mikoMint,
          plan.rewardToken,
          plan.swaps.holdersPortion.mikoAmount,
          100
        );
        
        if (!swapResult.success) {
          throw new Error(`Holders swap to reward token failed: ${swapResult.error}`);
        }
        
        swapsExecuted.push(swapResult.txSignature!);
        holdersReceived = swapResult.outputAmount;
        holdersToken = plan.rewardToken.toBase58();
      }
      
      logger.info('Swap plan executed successfully', {
        swapsExecuted: swapsExecuted.length,
        ownerReceived: ownerReceived / 1e9,
        holdersReceived: holdersReceived / 1e9,
        keeperTopUp: keeperTopUp / 1e9,
        ownerToken,
        holdersToken
      });
      
      return {
        success: true,
        swapsExecuted,
        finalAmounts: {
          ownerReceived,
          holdersReceived,
          keeperTopUp,
          ownerToken,
          holdersToken,
        },
      };
      
    } catch (error) {
      logger.error('Swap execution failed', { error });
      return {
        success: false,
        swapsExecuted: [],
        finalAmounts: {
          ownerReceived: 0,
          holdersReceived: 0,
          keeperTopUp: 0,
          ownerToken: 'MIKO',
          holdersToken: 'MIKO',
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async transferToOwner(token: PublicKey, amount: number): Promise<string> {
    // This will be called by the distribution engine
    // For now, just log
    logger.info('Transfer to owner requested', {
      token: token.toBase58(),
      amount: amount / 1e9,
      owner: this.ownerWallet.toBase58()
    });
    return 'mock-transfer-tx';
  }

  getStatus(): any {
    return {
      ownerWallet: this.ownerWallet.toBase58(),
      jupiterEnabled: true,
      solMint: SOL_MINT.toBase58(),
      minKeeperSol: MIN_KEEPER_SOL,
      targetKeeperSol: TARGET_KEEPER_SOL,
    };
  }
}