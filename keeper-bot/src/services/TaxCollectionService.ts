import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@project-serum/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { logger } from '../utils/logger';
import { config } from '../config';

export class TaxCollectionService {
  private connection: Connection;
  private provider: AnchorProvider;
  private absoluteVaultProgram: Program;
  private keeperWallet: Keypair;

  constructor(
    connection: Connection,
    keeperWallet: Keypair,
    absoluteVaultProgram: Program
  ) {
    this.connection = connection;
    this.keeperWallet = keeperWallet;
    this.provider = new AnchorProvider(
      connection,
      new Wallet(keeperWallet),
      { commitment: 'confirmed' }
    );
    this.absoluteVaultProgram = absoluteVaultProgram;
  }

  /**
   * Check the current tax balance in the holding account
   */
  async checkTaxBalance(): Promise<number> {
    try {
      const [taxHoldingPda] = await PublicKey.findProgramAddress(
        [Buffer.from('tax_holding')],
        this.absoluteVaultProgram.programId
      );

      const taxHoldingTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(config.MIKO_TOKEN_MINT),
        taxHoldingPda,
        true
      );

      const balance = await this.connection.getTokenAccountBalance(taxHoldingTokenAccount);
      const amount = balance.value.uiAmount || 0;
      
      logger.info(`Current tax balance: ${amount} MIKO`);
      return amount;
    } catch (error) {
      logger.error('Failed to check tax balance:', error);
      throw error;
    }
  }

  /**
   * Collect accumulated taxes and distribute to owner and treasury
   */
  async collectAndDistribute(): Promise<string> {
    try {
      const [taxConfigPda] = await PublicKey.findProgramAddress(
        [Buffer.from('tax_config')],
        this.absoluteVaultProgram.programId
      );

      const [taxHoldingPda] = await PublicKey.findProgramAddress(
        [Buffer.from('tax_holding')],
        this.absoluteVaultProgram.programId
      );

      // Fetch tax config to get owner and treasury wallets
      const taxConfig = await this.absoluteVaultProgram.account.taxConfig.fetch(taxConfigPda);
      
      // Get token accounts
      const taxHoldingTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(config.MIKO_TOKEN_MINT),
        taxHoldingPda,
        true
      );

      const ownerTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(config.MIKO_TOKEN_MINT),
        taxConfig.ownerWallet
      );

      const treasuryTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(config.MIKO_TOKEN_MINT),
        new PublicKey(config.TREASURY_WALLET)
      );

      // Build transaction
      const tx = await this.absoluteVaultProgram.methods
        .collectAndDistribute()
        .accounts({
          keeperBot: this.keeperWallet.publicKey,
          taxConfig: taxConfigPda,
          tokenMint: new PublicKey(config.MIKO_TOKEN_MINT),
          taxHoldingAccount: taxHoldingTokenAccount,
          taxHoldingPda: taxHoldingPda,
          ownerTokenAccount: ownerTokenAccount,
          ownerWallet: taxConfig.ownerWallet,
          treasuryTokenAccount: treasuryTokenAccount,
          treasuryWallet: new PublicKey(config.TREASURY_WALLET),
          smartDialProgram: new PublicKey(config.SMART_DIAL_PROGRAM),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      logger.info(`Tax collection successful: ${tx}`);
      return tx;
    } catch (error) {
      logger.error('Failed to collect and distribute taxes:', error);
      throw error;
    }
  }

  /**
   * Schedule periodic tax collection
   */
  schedulePeriodicCollection(intervalHours: number = 24): void {
    // Run immediately on startup
    this.checkAndCollectIfNeeded();

    // Schedule periodic checks
    setInterval(async () => {
      await this.checkAndCollectIfNeeded();
    }, intervalHours * 60 * 60 * 1000);

    logger.info(`Scheduled tax collection every ${intervalHours} hours`);
  }

  /**
   * Check balance and collect if above threshold
   */
  private async checkAndCollectIfNeeded(): Promise<void> {
    try {
      const balance = await this.checkTaxBalance();
      const threshold = config.TAX_COLLECTION_THRESHOLD;

      if (balance >= threshold) {
        logger.info(`Tax balance ${balance} exceeds threshold ${threshold}, collecting...`);
        await this.collectAndDistribute();
      } else {
        logger.info(`Tax balance ${balance} below threshold ${threshold}, skipping collection`);
      }
    } catch (error) {
      logger.error('Error in scheduled tax collection:', error);
    }
  }
}