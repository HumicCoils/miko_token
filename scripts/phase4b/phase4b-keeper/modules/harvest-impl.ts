import { 
  Connection, 
  PublicKey, 
  Transaction, 
  Keypair, 
  TransactionInstruction,
  sendAndConfirmTransaction,
  ParsedAccountData
} from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { 
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getTransferFeeAmount,
  unpackAccount
} from '@solana/spl-token';
import * as fs from 'fs';
import { createLogger } from '../utils/logger';

const logger = createLogger('HarvestImpl');

export class HarvestImpl {
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
   * Get accumulated fees from all token accounts
   */
  async getAccumulatedFees(): Promise<{
    totalFees: number;
    accountsWithFees: PublicKey[];
  }> {
    try {
      logger.info('Fetching all token accounts with fees');
      
      // Get all token accounts for this mint
      const accounts = await this.connection.getProgramAccounts(
        TOKEN_2022_PROGRAM_ID,
        {
          commitment: 'finalized',
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: this.tokenMint.toBase58(),
              },
            },
          ],
        }
      );

      let totalFees = 0;
      const accountsWithFees: PublicKey[] = [];

      for (const accountInfo of accounts) {
        try {
          // Unpack the account using SPL Token library
          const unpackedAccount = unpackAccount(
            accountInfo.pubkey,
            accountInfo.account,
            TOKEN_2022_PROGRAM_ID,
          );
          
          // Check if there are withheld tokens using the library function
          const transferFeeAmount = getTransferFeeAmount(unpackedAccount);
          if (
            transferFeeAmount != null &&
            transferFeeAmount.withheldAmount > BigInt(0)
          ) {
            accountsWithFees.push(accountInfo.pubkey);
            totalFees += Number(transferFeeAmount.withheldAmount);
            logger.debug(`Account ${accountInfo.pubkey.toBase58()} has ${transferFeeAmount.withheldAmount} withheld fees`);
          }
        } catch (e) {
          logger.warn(`Failed to parse account ${accountInfo.pubkey.toBase58()}`, { error: e });
        }
      }

      logger.info(`Found ${accountsWithFees.length} accounts with total fees: ${totalFees}`);
      return { totalFees, accountsWithFees };
      
    } catch (error) {
      logger.error('Failed to fetch accumulated fees', { error });
      return { totalFees: 0, accountsWithFees: [] };
    }
  }

  /**
   * Harvest fees from token accounts (Step 1 of 3-step flow)
   */
  async harvestFees(accounts: PublicKey[]): Promise<{
    success: boolean;
    txSignatures: string[];
    error?: string;
  }> {
    try {
      if (accounts.length === 0) {
        logger.warn('No accounts to harvest from');
        return { success: true, txSignatures: [] };
      }

      logger.info(`Harvesting fees from ${accounts.length} accounts`);
      
      const txSignatures: string[] = [];
      const batchSize = 20; // Max accounts per transaction
      
      // Process in batches
      for (let i = 0; i < accounts.length; i += batchSize) {
        const batch = accounts.slice(i, i + batchSize);
        logger.info(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(accounts.length/batchSize)}`);
        
        try {
          // Build the harvest_fees instruction
          const tx = await this.vaultProgram.methods
            .harvestFees(batch)
            .accounts({
              vault: this.vaultPda,
              keeper: this.keeper.publicKey,
              tokenMint: this.tokenMint,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .remainingAccounts(
              batch.map(account => ({
                pubkey: account,
                isWritable: true,
                isSigner: false,
              }))
            )
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

          logger.info(`Batch harvest successful: ${txSignature}`);
          txSignatures.push(txSignature);
          
        } catch (batchError) {
          logger.error(`Batch ${Math.floor(i/batchSize) + 1} failed`, { error: batchError });
          // Continue with next batch even if one fails
        }
      }

      return {
        success: txSignatures.length > 0,
        txSignatures,
      };

    } catch (error) {
      logger.error('Failed to harvest fees', { error });
      return {
        success: false,
        txSignatures: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Withdraw fees from mint to vault (Step 2 of 3-step flow)
   */
  async withdrawFeesFromMint(): Promise<{
    success: boolean;
    amount: number;
    txSignature?: string;
    error?: string;
  }> {
    try {
      logger.info('Withdrawing fees from mint to vault PDA');

      // Get vault's token account
      const vaultTokenAccount = getAssociatedTokenAddressSync(
        this.tokenMint,
        this.vaultPda,
        true, // Allow PDA owner
        TOKEN_2022_PROGRAM_ID
      );

      // Check if vault token account exists, create if not
      const accountInfo = await this.connection.getAccountInfo(vaultTokenAccount);
      if (!accountInfo) {
        logger.warn('Vault token account does not exist, it will be created during withdrawal');
      }

      // Get current withheld amount from mint using SPL Token library
      const { getMint, getTransferFeeConfig } = await import('@solana/spl-token');
      const mintInfo = await getMint(this.connection, this.tokenMint, 'confirmed', TOKEN_2022_PROGRAM_ID);
      const transferFeeConfig = getTransferFeeConfig(mintInfo);
      const withheldAmount = transferFeeConfig ? Number(transferFeeConfig.withheldAmount) : 0;
      
      logger.info(`Found ${withheldAmount / 1e9} MIKO withheld fees in mint`);

      if (withheldAmount === 0) {
        logger.warn('No withheld fees in mint to withdraw');
        return {
          success: true,
          amount: 0,
        };
      }

      // Build transaction
      const tx = new Transaction();
      
      // Create vault token account if it doesn't exist
      if (!accountInfo) {
        const { createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
        const createAtaIx = createAssociatedTokenAccountInstruction(
          this.keeper.publicKey, // payer
          vaultTokenAccount,     // ata
          this.vaultPda,         // owner
          this.tokenMint,        // mint
          TOKEN_2022_PROGRAM_ID, // token program
        );
        tx.add(createAtaIx);
        logger.info('Added instruction to create vault token account');
      }
      
      // Build the withdraw_fees_from_mint instruction
      const withdrawIx = await this.vaultProgram.methods
        .withdrawFeesFromMint()
        .accounts({
          vault: this.vaultPda,
          keeper: this.keeper.publicKey,
          tokenMint: this.tokenMint,
          vaultTokenAccount: vaultTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .instruction();
      
      tx.add(withdrawIx);

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

      logger.info(`Withdraw from mint successful: ${txSignature}`);
      
      return {
        success: true,
        amount: withheldAmount,
        txSignature,
      };

    } catch (error) {
      logger.error('Failed to withdraw fees from mint', { error });
      return {
        success: false,
        amount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get vault's token balance
   */
  async getVaultTokenBalance(): Promise<number> {
    try {
      const vaultTokenAccount = getAssociatedTokenAddressSync(
        this.tokenMint,
        this.vaultPda,
        true,
        TOKEN_2022_PROGRAM_ID
      );

      const accountInfo = await this.connection.getAccountInfo(vaultTokenAccount);
      if (!accountInfo) {
        return 0;
      }

      // Read balance from token account data
      const balance = accountInfo.data.readBigUInt64LE(64);
      return Number(balance);
      
    } catch (error) {
      logger.error('Failed to get vault token balance', { error });
      return 0;
    }
  }
}