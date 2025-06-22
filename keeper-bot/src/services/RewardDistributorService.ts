import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import * as cron from 'node-cron';
import axios from 'axios';
import { logger } from '../utils/logger';

export class RewardDistributorService {
  private connection: Connection;
  private keeperWallet: Keypair;
  private absoluteVaultProgram: Program;
  private smartDialProgram: Program;
  private isDistributing = false;

  constructor(
    connection: Connection,
    keeperWallet: Keypair,
    absoluteVaultProgram: Program,
    smartDialProgram: Program
  ) {
    this.connection = connection;
    this.keeperWallet = keeperWallet;
    this.absoluteVaultProgram = absoluteVaultProgram;
    this.smartDialProgram = smartDialProgram;
  }

  async startContinuousDistribution() {
    logger.info('Starting continuous reward distribution (every 5 minutes)');
    
    // Schedule every 5 minutes (offset by 2 minutes from tax collection)
    cron.schedule('2-59/5 * * * *', async () => {
      if (!this.isDistributing) {
        await this.distributeRewards();
      }
    });
  }

  private async distributeRewards() {
    this.isDistributing = true;
    
    try {
      logger.info('Starting reward distribution cycle...');
      
      // Step 1: Update holder registry
      await this.updateHolderRegistry();
      
      // Step 2: Get current reward token
      const rewardToken = await this.getCurrentRewardToken();
      if (!rewardToken) {
        logger.warn('No reward token set');
        return;
      }
      
      // Step 3: Swap treasury MIKO to reward token
      await this.swapToRewardToken(rewardToken);
      
      // Step 4: Distribute rewards to holders
      await this.executeDistribution(rewardToken);
      
      logger.info('Reward distribution cycle completed');
      
    } catch (error) {
      logger.error('Reward distribution failed:', error);
    } finally {
      this.isDistributing = false;
    }
  }

  private async updateHolderRegistry() {
    try {
      logger.info('Updating holder registry...');
      
      // Get MIKO price
      const mikoPrice = await this.getTokenPrice(process.env.MIKO_TOKEN_MINT!);
      
      // Get all token holders
      const holders = await this.getAllHolders();
      
      // Filter eligible holders ($100+ USD value)
      const eligibleHolders = holders.filter(h => {
        const usdValue = (h.balance / 1e9) * mikoPrice;
        return usdValue >= 100;
      });
      
      // Check exclusions
      const [exclusionsPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('exclusions')],
        this.absoluteVaultProgram.programId
      );
      
      const exclusions = await this.absoluteVaultProgram.account.exclusionList.fetch(exclusionsPda);
      
      const finalHolders = eligibleHolders.filter(h => 
        !exclusions.rewardExclusions.some(e => e.equals(h.address))
      );
      
      // Update registry
      const holderAddresses = finalHolders.map(h => h.address);
      const holderBalances = finalHolders.map(h => h.balance);
      
      const tx = await this.absoluteVaultProgram.methods
        .updateHolderRegistry(holderAddresses, holderBalances)
        .rpc();
      
      logger.info(`Updated holder registry: ${finalHolders.length} eligible holders (tx: ${tx})`);
      
    } catch (error) {
      logger.error('Failed to update holder registry:', error);
    }
  }

  private async getCurrentRewardToken(): Promise<PublicKey | null> {
    try {
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('smart_dial_config')],
        this.smartDialProgram.programId
      );
      
      const config = await this.smartDialProgram.account.dialConfig.fetch(configPda);
      
      if (config.currentRewardToken.equals(PublicKey.default)) {
        return null;
      }
      
      logger.info(`Current reward token: ${config.currentTokenSymbol}`);
      return config.currentRewardToken;
      
    } catch (error) {
      logger.error('Failed to get reward token:', error);
      return null;
    }
  }

  private async swapToRewardToken(rewardToken: PublicKey) {
    try {
      // Get treasury MIKO balance
      const treasuryBalance = await this.getTreasuryBalance();
      
      if (treasuryBalance === 0) {
        logger.info('No MIKO in treasury to swap');
        return;
      }
      
      logger.info(`Swapping ${treasuryBalance} MIKO to reward token...`);
      
      // Get quote from Jupiter
      const quote = await this.getJupiterQuote(
        new PublicKey(process.env.MIKO_TOKEN_MINT!),
        rewardToken,
        treasuryBalance
      );
      
      // Execute swap
      // In production, this would sign and send the Jupiter swap transaction
      logger.info(`Swap quote: ${treasuryBalance} MIKO -> ${quote.outAmount} reward tokens`);
      
    } catch (error) {
      logger.error('Failed to swap to reward token:', error);
    }
  }

  private async executeDistribution(rewardToken: PublicKey) {
    try {
      const tx = await this.absoluteVaultProgram.methods
        .distributeRewards(rewardToken)
        .rpc();
      
      logger.info(`Reward distribution executed: ${tx}`);
      
    } catch (error) {
      logger.error('Failed to execute distribution:', error);
    }
  }

  private async getTokenPrice(mint: string): Promise<number> {
    try {
      const response = await axios.get(
        `https://public-api.birdeye.so/defi/price`,
        {
          params: { address: mint },
          headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY },
        }
      );
      
      return response.data.data.value;
    } catch (error) {
      logger.error('Failed to get token price:', error);
      return 0;
    }
  }

  private async getAllHolders(): Promise<Array<{ address: PublicKey; balance: number }>> {
    // Simplified - in production would query all token accounts
    return [];
  }

  private async getTreasuryBalance(): Promise<number> {
    // Get treasury MIKO balance
    return 0;
  }

  private async getJupiterQuote(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number
  ): Promise<any> {
    // Get Jupiter swap quote
    return { outAmount: 0 };
  }
}