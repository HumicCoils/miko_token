import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import * as cron from 'node-cron';
import { logger } from '../utils/logger';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

export class TaxCollectorService {
  private connection: Connection;
  private keeperWallet: Keypair;
  private absoluteVaultProgram: Program;
  private isCollecting = false;

  constructor(
    connection: Connection,
    keeperWallet: Keypair,
    absoluteVaultProgram: Program
  ) {
    this.connection = connection;
    this.keeperWallet = keeperWallet;
    this.absoluteVaultProgram = absoluteVaultProgram;
  }

  async startContinuousCollection() {
    logger.info('Starting continuous tax collection (every 5 minutes)');
    
    // Run immediately
    await this.collectTaxes();
    
    // Schedule every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      if (!this.isCollecting) {
        await this.collectTaxes();
      }
    });
  }

  private async collectTaxes() {
    this.isCollecting = true;
    
    try {
      logger.info('Starting tax collection cycle...');
      
      // Get token accounts with withheld fees
      const tokenAccounts = await this.getTokenAccountsWithFees();
      
      if (tokenAccounts.length === 0) {
        logger.info('No accounts with withheld fees found');
        return;
      }
      
      // Harvest and collect fees
      const tx = await this.absoluteVaultProgram.methods
        .harvestAndCollectFees(tokenAccounts)
        .accounts({
          keeperBot: this.keeperWallet.publicKey,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      
      logger.info(`Tax collection successful: ${tx}`);
      logger.info(`Harvested fees from ${tokenAccounts.length} accounts`);
      
    } catch (error) {
      logger.error('Tax collection failed:', error);
    } finally {
      this.isCollecting = false;
    }
  }

  private async getTokenAccountsWithFees(): Promise<PublicKey[]> {
    try {
      // Get MIKO token mint from config
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('tax_config')],
        this.absoluteVaultProgram.programId
      );
      
      const config = await this.absoluteVaultProgram.account.taxConfig.fetch(configPda);
      
      // Find token accounts with withheld amounts
      const accounts = await this.connection.getProgramAccounts(
        TOKEN_2022_PROGRAM_ID,
        {
          filters: [
            { dataSize: 165 }, // Token account size
            {
              memcmp: {
                offset: 0,
                bytes: config.mikoTokenMint.toBase58(),
              },
            },
          ],
        }
      );
      
      // Filter accounts that have withheld amounts
      const accountsWithFees: PublicKey[] = [];
      
      for (const account of accounts) {
        // Check if account has withheld fees
        // In production, you'd parse the account data properly
        if (this.hasWithheldFees(account.account.data)) {
          accountsWithFees.push(account.pubkey);
        }
      }
      
      return accountsWithFees.slice(0, 10); // Limit to 10 accounts per transaction
      
    } catch (error) {
      logger.error('Failed to get token accounts:', error);
      return [];
    }
  }

  private hasWithheldFees(data: Buffer): boolean {
    // Simplified check - in production you'd properly deserialize
    // and check the withheld amount field
    return Math.random() > 0.5; // Placeholder
  }
}