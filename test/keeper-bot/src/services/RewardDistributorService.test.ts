import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import * as cron from 'node-cron';
import { logger } from '../../../../keeper-bot/src/utils/logger';

/**
 * TEST VERSION: Simplified reward distributor for devnet
 * - Distributes MIKO directly (no swaps)
 * - Uses token balance for eligibility (100,000 MIKO minimum)
 * - No price checks
 */
export class RewardDistributorServiceTest {
  private connection: Connection;
  private keeperWallet: Keypair;
  private absoluteVaultProgram: Program;
  private smartDialProgram: Program;
  private isDistributing = false;
  
  // Test threshold: 100,000 MIKO (with 9 decimals)
  private readonly MIN_BALANCE = 100_000_000_000_000n;

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
    logger.info('[TEST MODE] Starting reward distribution (every 5 minutes)');
    logger.info('[TEST MODE] Distributing MIKO directly to holders with 100k+ tokens');
    
    // Schedule every 5 minutes (offset by 2 minutes from collection)
    cron.schedule('2-59/5 * * * *', async () => {
      if (!this.isDistributing) {
        await this.distributeRewards();
      }
    });
  }

  private async distributeRewards() {
    this.isDistributing = true;
    
    try {
      logger.info('[TEST MODE] Starting reward distribution...');
      
      // Step 1: Update holder registry
      await this.updateHolderRegistry();
      
      // Step 2: Check treasury balance
      const treasuryBalance = await this.getTreasuryBalance();
      if (treasuryBalance === 0) {
        logger.info('[TEST MODE] No MIKO in treasury to distribute');
        return;
      }
      
      logger.info(`[TEST MODE] Treasury has ${treasuryBalance / 1e9} MIKO to distribute`);
      
      // Step 3: Execute distribution (MIKO directly, no swap)
      await this.executeDistribution();
      
      logger.info('[TEST MODE] Distribution cycle completed');
      
    } catch (error) {
      logger.error('[TEST MODE] Distribution failed:', error);
    } finally {
      this.isDistributing = false;
    }
  }

  private async updateHolderRegistry() {
    try {
      logger.info('[TEST MODE] Updating holder registry...');
      
      // Get all MIKO holders
      const holders = await this.getAllHolders();
      
      // Filter by balance (100,000 MIKO minimum)
      const eligibleHolders = holders.filter(h => h.balance >= this.MIN_BALANCE);
      
      logger.info(`[TEST MODE] Found ${eligibleHolders.length} eligible holders (100k+ MIKO)`);
      
      // Check exclusions
      const [exclusionsPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('exclusions')],
        this.absoluteVaultProgram.programId
      );
      
      const exclusions = await this.absoluteVaultProgram.account.exclusionList.fetch(exclusionsPda);
      
      const finalHolders = eligibleHolders.filter(h => 
        !exclusions.rewardExclusions.some(e => e.equals(h.address))
      );
      
      logger.info(`[TEST MODE] ${finalHolders.length} holders after exclusions`);
      
      // Update registry
      if (finalHolders.length > 0) {
        const addresses = finalHolders.map(h => h.address);
        const balances = finalHolders.map(h => h.balance);
        
        const tx = await this.absoluteVaultProgram.methods
          .updateHolderRegistry(addresses, balances)
          .rpc();
        
        logger.info(`[TEST MODE] Updated holder registry: ${tx}`);
      }
      
    } catch (error) {
      logger.error('[TEST MODE] Failed to update holder registry:', error);
    }
  }

  private async executeDistribution() {
    try {
      // Get MIKO mint from config
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('tax_config')],
        this.absoluteVaultProgram.programId
      );
      
      const config = await this.absoluteVaultProgram.account.taxConfig.fetch(configPda);
      
      // Use MIKO as reward token (no swap needed)
      const tx = await this.absoluteVaultProgram.methods
        .distributeRewards(config.mikoTokenMint)
        .rpc();
      
      logger.info(`[TEST MODE] MIKO distribution executed: ${tx}`);
      
    } catch (error) {
      logger.error('[TEST MODE] Failed to execute distribution:', error);
    }
  }

  private async getAllHolders(): Promise<Array<{ address: PublicKey; balance: bigint }>> {
    try {
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('tax_config')],
        this.absoluteVaultProgram.programId
      );
      
      const config = await this.absoluteVaultProgram.account.taxConfig.fetch(configPda);
      
      // Get all token accounts
      const accounts = await this.connection.getParsedProgramAccounts(
        TOKEN_2022_PROGRAM_ID,
        {
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: config.mikoTokenMint.toBase58(),
              },
            },
          ],
        }
      );
      
      const holders: Array<{ address: PublicKey; balance: bigint }> = [];
      
      for (const account of accounts) {
        const parsed = account.account.data as any;
        if (parsed.parsed?.info?.tokenAmount?.uiAmount > 0) {
          holders.push({
            address: new PublicKey(parsed.parsed.info.owner),
            balance: BigInt(parsed.parsed.info.tokenAmount.amount),
          });
        }
      }
      
      logger.info(`[TEST MODE] Found ${holders.length} total MIKO holders`);
      
      return holders;
      
    } catch (error) {
      logger.error('[TEST MODE] Failed to get holders:', error);
      return [];
    }
  }

  private async getTreasuryBalance(): Promise<number> {
    try {
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('tax_config')],
        this.absoluteVaultProgram.programId
      );
      
      const config = await this.absoluteVaultProgram.account.taxConfig.fetch(configPda);
      
      const treasuryAta = await getAssociatedTokenAddress(
        config.mikoTokenMint,
        config.treasuryWallet
      );
      
      const balance = await this.connection.getTokenAccountBalance(treasuryAta);
      return parseInt(balance.value.amount);
      
    } catch (error) {
      logger.error('[TEST MODE] Failed to get treasury balance:', error);
      return 0;
    }
  }
}