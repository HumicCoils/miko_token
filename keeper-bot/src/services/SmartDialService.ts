import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@project-serum/anchor';
import { logger } from '../utils/logger';

export class SmartDialService {
  private connection: Connection;
  private provider: AnchorProvider;
  private smartDialProgram: Program;
  private keeperWallet: Keypair;

  constructor(
    connection: Connection,
    keeperWallet: Keypair,
    smartDialProgram: Program
  ) {
    this.connection = connection;
    this.keeperWallet = keeperWallet;
    this.provider = new AnchorProvider(
      connection,
      new Wallet(keeperWallet),
      { commitment: 'confirmed' }
    );
    this.smartDialProgram = smartDialProgram;
  }

  /**
   * Get current reward token from Smart Dial
   */
  async getCurrentRewardToken(): Promise<PublicKey | null> {
    try {
      const [configPda] = await PublicKey.findProgramAddress(
        [Buffer.from('smart_dial_config')],
        this.smartDialProgram.programId
      );

      const config = await this.smartDialProgram.account.dialConfig.fetch(configPda);
      return config.currentRewardToken;
    } catch (error) {
      logger.error('Failed to get current reward token:', error);
      return null;
    }
  }

  /**
   * Update reward token in Smart Dial
   */
  async updateRewardToken(tokenAddress: PublicKey, symbol: string): Promise<void> {
    try {
      const [configPda] = await PublicKey.findProgramAddress(
        [Buffer.from('smart_dial_config')],
        this.smartDialProgram.programId
      );

      const tx = await this.smartDialProgram.methods
        .updateRewardToken(tokenAddress)
        .accounts({
          authority: this.keeperWallet.publicKey,
          dialConfig: configPda,
        })
        .rpc();

      logger.info(`Updated reward token to ${symbol} (${tokenAddress.toBase58()}): ${tx}`);
    } catch (error) {
      logger.error('Failed to update reward token:', error);
      throw error;
    }
  }

  /**
   * Get treasury wallet from Smart Dial
   */
  async getTreasuryWallet(): Promise<PublicKey> {
    try {
      const [configPda] = await PublicKey.findProgramAddress(
        [Buffer.from('smart_dial_config')],
        this.smartDialProgram.programId
      );

      const config = await this.smartDialProgram.account.dialConfig.fetch(configPda);
      return config.treasuryWallet;
    } catch (error) {
      logger.error('Failed to get treasury wallet:', error);
      throw error;
    }
  }
}