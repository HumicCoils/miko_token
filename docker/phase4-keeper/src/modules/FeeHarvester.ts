import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { createLogger } from '../utils/logger';
import { Phase4BConfig } from '../config/config';
import { HarvestImpl } from './harvest-impl';
import * as fs from 'fs';

const logger = createLogger('FeeHarvester');

export interface HarvestResult {
  success: boolean;
  totalHarvested: number;
  accountsProcessed: number;
  txSignatures?: string[];
  error?: string;
}

export interface WithdrawResult {
  success: boolean;
  amount: number;
  txSignature?: string;
  error?: string;
}

export class FeeHarvester {
  private connection: Connection;
  private config: Phase4BConfig;
  private mockAccumulatedFees = 0;
  private harvestImpl: HarvestImpl;
  private keeper: Keypair;
  private vaultIdl: any;
  private vaultPda: PublicKey;

  constructor(connection: Connection, config: Phase4BConfig) {
    this.connection = connection;
    this.config = config;
    
    // CRITICAL BUG: Vault was initialized with deployer as keeper_authority
    // This SHOULD have been the keeper keypair from phase4b-keeper-keypair.json
    // Using deployer keypair here is ONLY FOR TESTING - this is a SECURITY RISK
    // TODO: Fix vault initialization to properly separate authorities:
    //   - authority: deployer (admin control)
    //   - keeper_authority: keeper keypair (operational control)
    const deployerData = JSON.parse(fs.readFileSync('../phase4b-deployer.json', 'utf-8'));
    this.keeper = Keypair.fromSecretKey(new Uint8Array(deployerData));
    
    // Load vault IDL
    this.vaultIdl = JSON.parse(fs.readFileSync('../phase4b-vault-idl.json', 'utf-8'));
    
    // Initialize harvest implementation
    this.vaultPda = new PublicKey(this.config.pdas.vault_pda);
    this.harvestImpl = new HarvestImpl(
      connection,
      new PublicKey(this.config.programs.vault_program_id),
      this.vaultIdl,
      new PublicKey(this.config.token.mint_address),
      this.vaultPda,
      this.keeper
    );
  }

  async shouldHarvest(): Promise<boolean> {
    try {
      const threshold = this.config.harvest.threshold_miko * Math.pow(10, this.config.token.decimals);
      
      // Check vault balance first - if already has funds, process them
      const vaultBalance = await this.harvestImpl.getVaultTokenBalance();
      if (vaultBalance >= threshold) {
        logger.info(`Vault already has ${vaultBalance / 1e9} MIKO, proceeding with swaps`);
        return true;
      }
      
      // Otherwise check if new fees need harvesting
      const { totalFees } = await this.harvestImpl.getAccumulatedFees();
      
      // Also check mint's withheld amount
      const { getMint, getTransferFeeConfig } = await import('@solana/spl-token');
      const mintPubkey = new PublicKey(this.config.token.mint_address);
      const mintInfo = await getMint(this.connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
      const transferFeeConfig = getTransferFeeConfig(mintInfo);
      const mintWithheld = transferFeeConfig ? Number(transferFeeConfig.withheldAmount) : 0;
      
      const totalAvailable = totalFees + mintWithheld;
      
      logger.debug(`Account fees: ${totalFees}, Mint withheld: ${mintWithheld}, Total: ${totalAvailable}, Threshold: ${threshold}`);
      
      return totalAvailable >= threshold;
    } catch (error) {
      logger.error('Failed to check harvest threshold', { error });
      return false;
    }
  }

  async harvest(): Promise<HarvestResult> {
    try {
      logger.info('Starting fee harvest');
      
      // Get list of token accounts with fees
      const { totalFees, accountsWithFees } = await this.harvestImpl.getAccumulatedFees();
      
      if (accountsWithFees.length === 0) {
        // Check if fees are already in mint
        const { getMint, getTransferFeeConfig } = await import('@solana/spl-token');
        const mintPubkey = new PublicKey(this.config.token.mint_address);
        const mintInfo = await getMint(this.connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
        const transferFeeConfig = getTransferFeeConfig(mintInfo);
        const mintWithheld = transferFeeConfig ? Number(transferFeeConfig.withheldAmount) : 0;
        
        if (mintWithheld > 0) {
          logger.info(`No accounts with fees, but mint has ${mintWithheld / 1e9} MIKO withheld - skipping harvest`);
          return {
            success: true,
            totalHarvested: 0,
            accountsProcessed: 0,
            txSignatures: [],
          };
        }
        
        logger.warn('No accounts with fees to harvest and no fees in mint');
        return {
          success: true,
          totalHarvested: 0,
          accountsProcessed: 0,
          txSignatures: [],
        };
      }
      
      logger.info(`Harvesting from ${accountsWithFees.length} accounts with total ${totalFees} fees`);
      
      // Call harvest_fees for all accounts
      const result = await this.harvestImpl.harvestFees(accountsWithFees);
      
      if (!result.success) {
        throw new Error(result.error || 'Harvest failed');
      }
      
      return {
        success: true,
        totalHarvested: totalFees,
        accountsProcessed: accountsWithFees.length,
        txSignatures: result.txSignatures,
      };
    } catch (error) {
      logger.error('Harvest failed', { error });
      return {
        success: false,
        totalHarvested: 0,
        accountsProcessed: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async withdrawFromMint(): Promise<WithdrawResult> {
    try {
      logger.info('Withdrawing fees from mint to vault PDA');
      
      // Withdraw fees from mint's withheld account to vault PDA
      const result = await this.harvestImpl.withdrawFeesFromMint();
      
      if (!result.success) {
        throw new Error(result.error || 'Withdraw failed');
      }
      
      return {
        success: true,
        amount: result.amount,
        txSignature: result.txSignature,
      };
    } catch (error) {
      logger.error('Withdraw from mint failed', { error });
      return {
        success: false,
        amount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getVaultBalance(): Promise<number> {
    return await this.harvestImpl.getVaultTokenBalance();
  }

  async getStatus(): Promise<any> {
    try {
      const { totalFees, accountsWithFees } = await this.harvestImpl.getAccumulatedFees();
      const threshold = this.config.harvest.threshold_miko * Math.pow(10, this.config.token.decimals);
      const vaultBalance = await this.harvestImpl.getVaultTokenBalance();
      
      return {
        accumulatedFees: totalFees,
        accountsWithFees: accountsWithFees.length,
        threshold: this.config.harvest.threshold_miko,
        readyToHarvest: totalFees >= threshold || vaultBalance >= threshold,
        vaultBalance: vaultBalance / Math.pow(10, this.config.token.decimals),
      };
    } catch (error) {
      logger.error('Failed to get status', { error });
      return {
        accumulatedFees: 0,
        accountsWithFees: 0,
        threshold: this.config.harvest.threshold_miko,
        readyToHarvest: false,
        vaultBalance: 0,
      };
    }
  }

  // Test helper
  addMockFees(amount: number): void {
    this.mockAccumulatedFees += amount;
    logger.info(`Added mock fees: ${amount}, Total: ${this.mockAccumulatedFees}`);
  }
}