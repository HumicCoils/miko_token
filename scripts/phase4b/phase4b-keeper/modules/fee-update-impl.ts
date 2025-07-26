import { 
  Connection, 
  PublicKey, 
  Transaction, 
  Keypair, 
  TransactionInstruction,
  sendAndConfirmTransaction 
} from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import { createLogger } from '../utils/logger';

const logger = createLogger('FeeUpdateImpl');

// Token-2022 Program ID
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

export class FeeUpdateImpl {
  private connection: Connection;
  private vaultProgram: Program;
  private tokenMint: PublicKey;
  private vaultPda: PublicKey;
  private keeper: Keypair;

  constructor(
    connection: Connection,
    vaultProgramId: PublicKey,
    vaultIdl: any,
    tokenMint: PublicKey,
    vaultPda: PublicKey,
    keeper: Keypair
  ) {
    this.connection = connection;
    this.tokenMint = tokenMint;
    this.vaultPda = vaultPda;
    this.keeper = keeper;

    // Create anchor provider and program
    const provider = new AnchorProvider(
      connection,
      new Wallet(keeper),
      { commitment: 'confirmed' }
    );
    
    // Override IDL address to match deployed program
    vaultIdl.address = vaultProgramId.toBase58();
    this.vaultProgram = new Program(vaultIdl, provider);
  }

  /**
   * Update the transfer fee on the token
   */
  async updateTransferFee(newFeeRate: number): Promise<{
    success: boolean;
    txSignature?: string;
    error?: string;
  }> {
    try {
      logger.info(`Updating transfer fee to ${newFeeRate / 100}%`);

      // Build the update_transfer_fee instruction
      const tx = await this.vaultProgram.methods
        .updateTransferFee(newFeeRate)
        .accounts({
          vault: this.vaultPda,
          keeper: this.keeper.publicKey,
          tokenMint: this.tokenMint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .transaction();

      // Send and confirm transaction
      const txSignature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.keeper],
        {
          commitment: 'confirmed',
          maxRetries: 3,
        }
      );

      logger.info(`Fee update successful: ${txSignature}`);
      
      return {
        success: true,
        txSignature,
      };

    } catch (error) {
      logger.error('Failed to update transfer fee', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get current vault state to check fee status
   */
  async getVaultState(): Promise<{
    launchTimestamp: number;
    feeFinalized: boolean;
    currentFee?: number;
  } | null> {
    try {
      const vault = await (this.vaultProgram.account as any).vaultState.fetch(this.vaultPda);
      
      // Get current fee from token mint
      let currentFee: number | undefined;
      try {
        const mintInfo = await this.connection.getAccountInfo(this.tokenMint);
        if (mintInfo) {
          // Parse Token-2022 mint data to get transfer fee
          const data = mintInfo.data;
          
          // Look for transfer fee extension (type 1)
          let offset = 82; // Base mint size
          const extensionTypeSize = 2;
          const lengthSize = 2;
          
          while (offset + extensionTypeSize + lengthSize <= data.length) {
            const extensionType = data.readUInt16LE(offset);
            const extensionLength = data.readUInt16LE(offset + extensionTypeSize);
            
            if (extensionType === 1) { // TransferFeeConfig
              // Found transfer fee extension
              const feeConfigOffset = offset + extensionTypeSize + lengthSize;
              
              // Read current fee (at offset 16 in the extension)
              currentFee = data.readUInt16LE(feeConfigOffset + 16);
              logger.debug(`Current fee from mint: ${currentFee} basis points (${currentFee / 100}%)`);
              break;
            }
            
            offset += extensionTypeSize + lengthSize + extensionLength;
          }
        }
      } catch (e) {
        logger.warn('Could not fetch current fee from mint', { error: e });
      }

      return {
        launchTimestamp: vault.launchTimestamp.toNumber(),
        feeFinalized: vault.feeFinalized,
        currentFee,
      };
    } catch (error) {
      logger.error('Failed to fetch vault state', { error });
      return null;
    }
  }

  /**
   * Calculate expected fee based on elapsed time
   */
  calculateExpectedFee(launchTimestamp: number, currentTime: number): number {
    const elapsed = currentTime - launchTimestamp;
    
    if (elapsed < 300) {  // 0-5 minutes
      return 3000;  // 30%
    } else if (elapsed < 600) {  // 5-10 minutes
      return 1500;  // 15%
    } else {  // 10+ minutes
      return 500;   // 5%
    }
  }
}