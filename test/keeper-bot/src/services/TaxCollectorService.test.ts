import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import * as cron from 'node-cron';
import { logger } from '../../../../keeper-bot/src/utils/logger';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

/**
 * TEST VERSION: Simplified tax collector for devnet
 * - Collects fees but doesn't swap
 * - Ready for direct MIKO distribution
 */
export class TaxCollectorServiceTest {
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
    logger.info('[TEST MODE] Starting tax collection (every 5 minutes)');
    logger.info('[TEST MODE] Fees will be collected for direct MIKO distribution');
    
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
      logger.info('[TEST MODE] Starting tax collection...');
      
      // Get test token accounts
      const tokenAccounts = await this.getTestTokenAccounts();
      
      if (tokenAccounts.length === 0) {
        logger.info('[TEST MODE] No accounts with fees found');
        return;
      }
      
      logger.info(`[TEST MODE] Found ${tokenAccounts.length} accounts with fees`);
      
      // Harvest and collect fees
      const tx = await this.absoluteVaultProgram.methods
        .harvestAndCollectFees(tokenAccounts)
        .accounts({
          keeperBot: this.keeperWallet.publicKey,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      
      logger.info(`[TEST MODE] Tax collection successful: ${tx}`);
      logger.info('[TEST MODE] 1% sent to owner, 4% ready for distribution');
      
    } catch (error) {
      logger.error('[TEST MODE] Tax collection failed:', error);
    } finally {
      this.isCollecting = false;
    }
  }

  private async getTestTokenAccounts(): Promise<PublicKey[]> {
    try {
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('tax_config')],
        this.absoluteVaultProgram.programId
      );
      
      const config = await this.absoluteVaultProgram.account.taxConfig.fetch(configPda);
      
      // Get token accounts
      const accounts = await this.connection.getProgramAccounts(
        TOKEN_2022_PROGRAM_ID,
        {
          filters: [
            { dataSize: 165 },
            {
              memcmp: {
                offset: 0,
                bytes: config.mikoTokenMint.toBase58(),
              },
            },
          ],
        }
      );
      
      // For testing, limit to 10 accounts
      const testAccounts = accounts.slice(0, 10).map(a => a.pubkey);
      
      logger.info(`[TEST MODE] Checking ${testAccounts.length} accounts for fees`);
      
      return testAccounts;
      
    } catch (error) {
      logger.error('[TEST MODE] Failed to get token accounts:', error);
      return [];
    }
  }
}