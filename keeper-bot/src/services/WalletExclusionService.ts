import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@project-serum/anchor';
import { logger } from '../utils/logger';

export class WalletExclusionService {
  private connection: Connection;
  private provider: AnchorProvider;
  private absoluteVaultProgram: Program;
  private authority: Keypair;

  constructor(
    connection: Connection,
    authority: Keypair,
    absoluteVaultProgram: Program
  ) {
    this.connection = connection;
    this.authority = authority;
    this.provider = new AnchorProvider(
      connection,
      new Wallet(authority),
      { commitment: 'confirmed' }
    );
    this.absoluteVaultProgram = absoluteVaultProgram;
  }

  /**
   * Add wallet to reward exclusion list
   */
  async addRewardExclusion(wallet: PublicKey, reason: string): Promise<void> {
    try {
      logger.info(`Adding reward exclusion for ${wallet.toBase58()}: ${reason}`);
      
      const [exclusionsPda] = await PublicKey.findProgramAddress(
        [Buffer.from('exclusions')],
        this.absoluteVaultProgram.programId
      );

      const tx = await this.absoluteVaultProgram.methods
        .addRewardExclusion(wallet)
        .accounts({
          authority: this.authority.publicKey,
          rewardExclusions: exclusionsPda,
        })
        .rpc();

      logger.info(`Added reward exclusion: ${tx}`);
    } catch (error) {
      logger.error('Failed to add reward exclusion:', error);
      throw error;
    }
  }

  /**
   * Remove wallet from reward exclusion list
   */
  async removeRewardExclusion(wallet: PublicKey): Promise<void> {
    try {
      logger.info(`Removing reward exclusion for ${wallet.toBase58()}`);
      
      const [exclusionsPda] = await PublicKey.findProgramAddress(
        [Buffer.from('exclusions')],
        this.absoluteVaultProgram.programId
      );

      const tx = await this.absoluteVaultProgram.methods
        .removeRewardExclusion(wallet)
        .accounts({
          authority: this.authority.publicKey,
          rewardExclusions: exclusionsPda,
        })
        .rpc();

      logger.info(`Removed reward exclusion: ${tx}`);
    } catch (error) {
      logger.error('Failed to remove reward exclusion:', error);
      throw error;
    }
  }

  /**
   * Add wallet to tax exemption list
   */
  async addTaxExemption(wallet: PublicKey, reason: string): Promise<void> {
    try {
      logger.info(`Adding tax exemption for ${wallet.toBase58()}: ${reason}`);
      
      const [exemptionsPda] = await PublicKey.findProgramAddress(
        [Buffer.from('tax_exemptions')],
        this.absoluteVaultProgram.programId
      );

      const tx = await this.absoluteVaultProgram.methods
        .addTaxExemption(wallet)
        .accounts({
          authority: this.authority.publicKey,
          taxExemptions: exemptionsPda,
        })
        .rpc();

      logger.info(`Added tax exemption: ${tx}`);
    } catch (error) {
      logger.error('Failed to add tax exemption:', error);
      throw error;
    }
  }

  /**
   * Remove wallet from tax exemption list
   */
  async removeTaxExemption(wallet: PublicKey): Promise<void> {
    try {
      logger.info(`Removing tax exemption for ${wallet.toBase58()}`);
      
      const [exemptionsPda] = await PublicKey.findProgramAddress(
        [Buffer.from('tax_exemptions')],
        this.absoluteVaultProgram.programId
      );

      const tx = await this.absoluteVaultProgram.methods
        .removeTaxExemption(wallet)
        .accounts({
          authority: this.authority.publicKey,
          taxExemptions: exemptionsPda,
        })
        .rpc();

      logger.info(`Removed tax exemption: ${tx}`);
    } catch (error) {
      logger.error('Failed to remove tax exemption:', error);
      throw error;
    }
  }

  /**
   * Get current exclusion lists
   */
  async getExclusionLists(): Promise<{
    rewardExclusions: PublicKey[];
    taxExemptions: PublicKey[];
  }> {
    try {
      const [rewardExclusionsPda] = await PublicKey.findProgramAddress(
        [Buffer.from('exclusions')],
        this.absoluteVaultProgram.programId
      );

      const [taxExemptionsPda] = await PublicKey.findProgramAddress(
        [Buffer.from('tax_exemptions')],
        this.absoluteVaultProgram.programId
      );

      const rewardExclusions = await this.absoluteVaultProgram.account.rewardExclusions.fetch(rewardExclusionsPda);
      const taxExemptions = await this.absoluteVaultProgram.account.taxExemptions.fetch(taxExemptionsPda);

      return {
        rewardExclusions: rewardExclusions.excludedAddresses,
        taxExemptions: taxExemptions.exemptAddresses,
      };
    } catch (error) {
      logger.error('Failed to get exclusion lists:', error);
      throw error;
    }
  }

  /**
   * Initialize exclusion lists with default wallets
   */
  async initializeDefaultExclusions(): Promise<void> {
    try {
      // Default exclusions for non-user wallets
      const defaultExclusions = [
        config.TREASURY_WALLET,
        config.ABSOLUTE_VAULT_PROGRAM,
        config.SMART_DIAL_PROGRAM,
        config.MIKO_TRANSFER_PROGRAM,
      ];

      logger.info('Initializing default exclusions...');

      const tx = await this.absoluteVaultProgram.methods
        .initializeExclusions(
          defaultExclusions.map(addr => new PublicKey(addr)),
          [] // No default tax exemptions
        )
        .accounts({
          authority: this.authority.publicKey,
          // ... other accounts
        })
        .rpc();

      logger.info(`Initialized default exclusions: ${tx}`);
    } catch (error) {
      logger.error('Failed to initialize default exclusions:', error);
      throw error;
    }
  }
}