import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount
} from '@solana/spl-token';
import { Raydium, CurveCalculator } from '@raydium-io/raydium-sdk-v2';
import { BN } from '@coral-xyz/anchor';
import { Logger } from '../utils/logger';
import { getConfigManager } from '../../../scripts/config-manager';

interface SwapResult {
  success: boolean;
  outputAmount: number;
  signature?: string;
  error?: string;
}

/**
 * Raydium swap service for local testing
 * Uses actual Raydium CPMM pools on local fork
 */
export class RaydiumSwapService {
  private connection: Connection;
  private wallet: Keypair;
  private config: any;
  private logger: Logger;
  private configManager: any;
  private raydium?: Raydium;
  
  constructor(connection: Connection, wallet: Keypair, config: any) {
    this.connection = connection;
    this.wallet = wallet;
    this.config = config;
    this.logger = new Logger('RaydiumSwapService');
    this.configManager = getConfigManager();
  }
  
  /**
   * Swap MIKO for reward token
   */
  async swapMikoForToken(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number
  ): Promise<SwapResult> {
    return this.swapTokens(inputMint, outputMint, amount, this.wallet.publicKey);
  }
  
  /**
   * Generic token swap using Raydium
   */
  async swapTokens(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number,
    userPublicKey: PublicKey
  ): Promise<SwapResult> {
    try {
      this.logger.info('Initiating Raydium swap', {
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        amount: amount / 1e9,
        user: userPublicKey.toBase58()
      });
      
      // Initialize Raydium if not already initialized
      if (!this.raydium) {
        this.raydium = await Raydium.load({
          connection: this.connection,
          owner: this.wallet,
          cluster: 'devnet',
          disableFeatureCheck: true,
          disableLoadToken: false,
          blockhashCommitment: 'confirmed',
        });
      }
      
      // Get deployment pool info
      const deploymentState = this.configManager.getDeploymentState();
      if (!deploymentState.pool_id) {
        throw new Error('Pool ID not found in deployment state');
      }
      
      const poolId = new PublicKey(deploymentState.pool_id);
      
      // Get pool information
      const data = await this.raydium.cpmm.getPoolInfoFromRpc(poolId.toBase58());
      const poolInfo = data.poolInfo;
      const poolKeys = data.poolKeys;
      const rpcData = data.rpcData;
      
      // Determine if we're swapping base token or quote token
      const baseIn = inputMint.toBase58() === poolInfo.mintA.address;
      
      // Create BN for amount
      const inputAmount = new BN(amount.toString());
      
      // Calculate swap output using CurveCalculator
      const swapResult = CurveCalculator.swap(
        inputAmount,
        baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
        baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
        rpcData.configInfo!.tradeFeeRate
      );
      
      // Pre-create output ATA if needed
      const outputTokenProgram = outputMint.equals(new PublicKey('So11111111111111111111111111111111111111112')) 
        ? TOKEN_PROGRAM_ID 
        : TOKEN_2022_PROGRAM_ID;
      
      const userOutputATA = getAssociatedTokenAddressSync(
        outputMint,
        this.wallet.publicKey,
        false,
        outputTokenProgram
      );
      
      // Check if ATA exists
      let createATANeeded = false;
      try {
        await getAccount(this.connection, userOutputATA, undefined, outputTokenProgram);
      } catch {
        createATANeeded = true;
      }
      
      if (createATANeeded) {
        const createATATx = new Transaction();
        createATATx.add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
          createAssociatedTokenAccountInstruction(
            this.wallet.publicKey,
            userOutputATA,
            this.wallet.publicKey,
            outputMint,
            outputTokenProgram
          )
        );
        
        const { blockhash } = await this.connection.getLatestBlockhash();
        createATATx.recentBlockhash = blockhash;
        createATATx.feePayer = this.wallet.publicKey;
        
        await sendAndConfirmTransaction(
          this.connection,
          createATATx,
          [this.wallet],
          { commitment: 'confirmed' }
        );
        
        this.logger.info('Created output token account', {
          ata: userOutputATA.toBase58(),
          mint: outputMint.toBase58()
        });
      }
      
      // Build and execute the swap transaction
      const { execute } = await this.raydium.cpmm.swap({
        poolInfo,
        poolKeys,
        inputAmount,
        swapResult,
        slippage: (this.config.jupiter?.slippage_bps || 5000) / 10000, // Convert basis points to decimal
        baseIn,
        computeBudgetConfig: {
          units: 400_000,
          microLamports: 1_000,
        },
      });
      
      // Execute the transaction
      const { txId } = await execute({ sendAndConfirm: true });
      
      this.logger.info('Raydium swap successful', {
        signature: txId,
        inputAmount: amount / 1e9,
        outputAmount: Number(swapResult.destinationAmountSwapped) / 1e9,
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58()
      });
      
      return {
        success: true,
        outputAmount: Number(swapResult.destinationAmountSwapped),
        signature: txId
      };
      
    } catch (error: any) {
      this.logger.error('Raydium swap failed', {
        error: error.message,
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        amount: amount / 1e9
      });
      
      return {
        success: false,
        outputAmount: 0,
        error: error.message
      };
    }
  }
  
  /**
   * Get token price (not used in test mode)
   */
  async getTokenPrice(_mint: PublicKey): Promise<number> {
    this.logger.warn('Price API not available in test mode', {
      note: 'Would fetch price for ' + _mint.toBase58() + ' in production'
    });
    return 0;
  }
}