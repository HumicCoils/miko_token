import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { createLogger } from '../utils/logger';
import { FeeUpdateImpl } from './fee-update-impl';
import * as fs from 'fs';

const logger = createLogger('FeeUpdateManagerPhase4B');

export interface FeeUpdateResult {
  success: boolean;
  newFeeRate: number;
  txSignature?: string;
  error?: string;
  authorityRevoked?: boolean;
}

export class FeeUpdateManagerPhase4B {
  private connection: Connection;
  private config: any;
  private vaultProgramId: PublicKey;
  private tokenMint: PublicKey;
  private launchTimestamp: number | null = null;
  private feeFinalized = false;
  private feeUpdateImpl: FeeUpdateImpl;
  private vaultPda: PublicKey;

  constructor(
    connection: Connection, 
    config: any,
    vaultProgramId: PublicKey,
    vaultIdl: any,
    tokenMint: PublicKey,
    vaultPda: PublicKey,
    keeper: Keypair
  ) {
    this.connection = connection;
    this.config = config;
    this.vaultProgramId = vaultProgramId;
    this.tokenMint = tokenMint;
    this.vaultPda = vaultPda;

    // Initialize the real fee update implementation
    this.feeUpdateImpl = new FeeUpdateImpl(
      connection,
      vaultProgramId,
      vaultIdl,
      tokenMint,
      vaultPda,
      keeper
    );

    // Try to load launch timestamp from vault state
    this.loadLaunchTimestamp();
  }

  /**
   * Load launch timestamp from vault state
   */
  private async loadLaunchTimestamp(): Promise<void> {
    try {
      const vaultState = await this.feeUpdateImpl.getVaultState();
      if (vaultState && vaultState.launchTimestamp > 0) {
        this.launchTimestamp = vaultState.launchTimestamp;
        this.feeFinalized = vaultState.feeFinalized;
        logger.info(`Launch timestamp loaded from vault: ${new Date(this.launchTimestamp * 1000).toISOString()}`);
        logger.info(`Fee finalized: ${this.feeFinalized}`);
      }
    } catch (error) {
      logger.error('Failed to load launch timestamp from vault', { error });
    }
  }

  /**
   * Set the launch timestamp when Raydium pool is created
   */
  setLaunchTimestamp(timestamp: number): void {
    if (this.launchTimestamp !== null) {
      logger.warn('Launch timestamp already set, ignoring new value');
      return;
    }
    
    this.launchTimestamp = timestamp;
    logger.info(`Launch timestamp set: ${new Date(timestamp * 1000).toISOString()}`);
  }

  /**
   * Get current fee rate based on elapsed time since launch
   */
  getCurrentFeeRate(currentTime?: number): number {
    if (!this.launchTimestamp) {
      return 3000; // Default 30% if not launched
    }

    // Use provided time or system time
    const now = currentTime || (Date.now() / 1000);
    const elapsed = now - this.launchTimestamp;
    
    if (elapsed < 300) {  // 0-5 minutes
      return 3000; // 30%
    } else if (elapsed < 600) {  // 5-10 minutes
      return 1500; // 15%
    } else {
      return 500; // 5%
    }
  }

  /**
   * Check if fee update is needed and execute if necessary
   */
  async checkAndUpdateFee(): Promise<FeeUpdateResult | null> {
    // Reload vault state to ensure we have latest info
    await this.loadLaunchTimestamp();

    if (!this.launchTimestamp) {
      logger.debug('No launch timestamp set, skipping fee update check');
      return null;
    }

    if (this.feeFinalized) {
      logger.debug('Fee already finalized at 5%, no update needed');
      return null;
    }

    // Get blockchain time from Solana
    let blockchainTime: number;
    try {
      const slot = await this.connection.getSlot();
      const blockTime = await this.connection.getBlockTime(slot);
      if (!blockTime) {
        logger.warn('Could not get blockchain time, using system time');
        blockchainTime = Math.floor(Date.now() / 1000);
      } else {
        blockchainTime = blockTime;
        logger.debug(`Blockchain time: ${new Date(blockchainTime * 1000).toISOString()}`);
      }
    } catch (error) {
      logger.warn('Failed to get blockchain time, using system time', { error });
      blockchainTime = Math.floor(Date.now() / 1000);
    }

    const elapsed = blockchainTime - this.launchTimestamp;
    
    // Get the ACTUAL current fee from vault state (not calculated)
    const vaultState = await this.feeUpdateImpl.getVaultState();
    const actualCurrentFee = vaultState?.currentFee || 3000; // Default to 30% if can't read
    
    // Check if we need to update based on elapsed time
    let targetFeeRate: number | null = null;
    let shouldRevoke = false;

    if (elapsed >= 600) {  // 10+ minutes
      if (actualCurrentFee !== 500) {
        targetFeeRate = 500;
        shouldRevoke = true;
        logger.info(`10 minutes elapsed (${Math.floor(elapsed/60)}m), updating fee from ${actualCurrentFee/100}% to 5% and fee will be finalized`);
      }
    } else if (elapsed >= 300 && elapsed < 600) {  // 5-10 minutes
      if (actualCurrentFee === 3000) {
        targetFeeRate = 1500;
        logger.info(`5 minutes elapsed (${Math.floor(elapsed/60)}m), updating fee from 30% to 15%`);
      }
    }

    if (targetFeeRate === null) {
      logger.debug(`No fee update needed. Elapsed: ${Math.floor(elapsed)}s (${Math.floor(elapsed/60)}m), Actual fee: ${actualCurrentFee / 100}%`);
      return null;
    }

    return await this.updateTransferFee(targetFeeRate, shouldRevoke);
  }

  /**
   * Update the transfer fee on the token
   */
  private async updateTransferFee(
    newFeeRate: number,
    revokeAuthority: boolean
  ): Promise<FeeUpdateResult> {
    try {
      logger.info(`Executing real fee update to ${newFeeRate / 100}%`);
      
      // Use the real implementation
      const result = await this.feeUpdateImpl.updateTransferFee(newFeeRate);
      
      if (result.success) {
        if (revokeAuthority) {
          this.feeFinalized = true;
          logger.info('Fee update successful, fee finalized at 5%');
        }
        
        return {
          success: true,
          newFeeRate,
          txSignature: result.txSignature,
          authorityRevoked: revokeAuthority
        };
      } else {
        return {
          success: false,
          newFeeRate,
          error: result.error
        };
      }

    } catch (error) {
      logger.error('Failed to update transfer fee', { error });
      return {
        success: false,
        newFeeRate,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get time remaining until next fee update
   */
  getTimeUntilNextUpdate(blockchainTime?: number): number | null {
    if (!this.launchTimestamp || this.feeFinalized) {
      return null;
    }

    const now = blockchainTime || (Date.now() / 1000);
    const elapsed = now - this.launchTimestamp;
    
    if (elapsed < 300) {  // 0-5 minutes
      return 300 - elapsed;
    } else if (elapsed < 600) {  // 5-10 minutes
      return 600 - elapsed;
    }

    return null;
  }

  /**
   * Get current fee status
   */
  getStatus(): {
    launched: boolean;
    launchTimestamp: number | null;
    currentFeeRate: number;
    feeFinalized: boolean;
    timeUntilNextUpdate: number | null;
    elapsedSinceLaunch: number | null;
  } {
    // Note: Status uses system time for display purposes
    const elapsed = this.launchTimestamp 
      ? Date.now() / 1000 - this.launchTimestamp 
      : null;

    return {
      launched: this.launchTimestamp !== null,
      launchTimestamp: this.launchTimestamp,
      currentFeeRate: this.getCurrentFeeRate(),
      feeFinalized: this.feeFinalized,
      timeUntilNextUpdate: this.getTimeUntilNextUpdate(),
      elapsedSinceLaunch: elapsed
    };
  }
}