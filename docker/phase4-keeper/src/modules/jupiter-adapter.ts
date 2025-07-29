import { Connection, PublicKey, Keypair, VersionedTransaction, Transaction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createSyncNativeInstruction, createCloseAccountInstruction, getAccount } from '@solana/spl-token';
import { createLogger } from '../utils/logger';
import axios from 'axios';
import { Raydium, TxVersion, CurveCalculator } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import * as fs from 'fs';

const logger = createLogger('JupiterAdapter');

const JUPITER_API_URL = 'https://quote-api.jup.ag/v6';
const MAINNET_TOKENS_API = 'https://tokens.jup.ag/tokens';
const DEVNET_TOKENS_API = 'https://tokens.jup.ag/tokens?tags=unknown';

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  marketInfos: any[];
  slippageBps: number;
}

export interface JupiterSwapResult {
  success: boolean;
  txSignature?: string;
  inputAmount: number;
  outputAmount: number;
  error?: string;
}

export class JupiterAdapter {
  private connection: Connection;
  private isMainnetFork: boolean;
  private raydium: Raydium | null = null;
  private poolId: PublicKey | null = null;
  
  constructor(connection: Connection, poolId?: PublicKey) {
    this.connection = connection;
    // Determine if we're on mainnet fork based on RPC URL
    this.isMainnetFork = !connection.rpcEndpoint.includes('devnet');
    this.poolId = poolId || null;
  }
  
  async getQuote(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number,
    slippageBps: number = 50 // 0.5% default
  ): Promise<JupiterQuote | null> {
    try {
      const params = {
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        amount: amount.toString(),
        slippageBps: slippageBps.toString(),
        // Token-2022 specific parameters
        platformFeeBps: '0',
        asLegacyTransaction: 'false',
        // For mainnet fork, we need to handle Token-2022
        onlyDirectRoutes: 'false',
        maxAccounts: '64',
      };
      
      const response = await axios.get(`${JUPITER_API_URL}/quote`, { params });
      
      if (!response.data) {
        logger.error('No quote data received from Jupiter');
        return null;
      }
      
      return response.data;
    } catch (error) {
      logger.error('Failed to get Jupiter quote', { error });
      return null;
    }
  }
  
  async executeSwap(
    owner: Keypair,
    quote: JupiterQuote
  ): Promise<JupiterSwapResult> {
    try {
      // Get swap transaction from Jupiter
      const swapResponse = await axios.post(`${JUPITER_API_URL}/swap`, {
        quoteResponse: quote,
        userPublicKey: owner.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        asLegacyTransaction: false,
        prioritizationFeeLamports: 'auto',
        dynamicComputeUnitLimit: true,
      });
      
      if (!swapResponse.data || !swapResponse.data.swapTransaction) {
        throw new Error('No swap transaction received from Jupiter');
      }
      
      // Deserialize the transaction
      const swapTransactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      
      // Sign the transaction
      transaction.sign([owner]);
      
      // Execute the transaction
      const rawTransaction = transaction.serialize();
      const txSignature = await this.connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      
      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(txSignature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      return {
        success: true,
        txSignature,
        inputAmount: parseInt(quote.inAmount),
        outputAmount: parseInt(quote.outAmount),
      };
    } catch (error) {
      logger.error('Swap execution failed', { error });
      return {
        success: false,
        inputAmount: parseInt(quote.inAmount),
        outputAmount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  async swapMikoToSol(
    owner: Keypair,
    mikoMint: PublicKey,
    amount: number,
    slippageBps: number = 50
  ): Promise<JupiterSwapResult> {
    const solMint = new PublicKey('So11111111111111111111111111111111111111112');
    
    logger.info('Getting quote for MIKO -> SOL swap', {
      amount: amount / 1e9,
      slippage: slippageBps / 100,
    });
    
    const quote = await this.getQuote(mikoMint, solMint, amount, slippageBps);
    
    if (!quote) {
      // Fallback to Raydium for local fork
      logger.info('Jupiter quote failed, falling back to Raydium CPMM');
      return await this.raydiumSwapMikoToSol(owner, mikoMint, amount, slippageBps);
    }
    
    logger.info('Quote received', {
      inputAmount: parseInt(quote.inAmount) / 1e9,
      outputAmount: parseInt(quote.outAmount) / 1e9,
      priceImpact: quote.priceImpactPct,
    });
    
    return await this.executeSwap(owner, quote);
  }
  
  async swapMikoToRewardToken(
    owner: Keypair,
    mikoMint: PublicKey,
    rewardTokenMint: PublicKey,
    amount: number,
    slippageBps: number = 50
  ): Promise<JupiterSwapResult> {
    logger.info('Getting quote for MIKO -> Reward Token swap', {
      rewardToken: rewardTokenMint.toBase58(),
      amount: amount / 1e9,
      slippage: slippageBps / 100,
    });
    
    const quote = await this.getQuote(mikoMint, rewardTokenMint, amount, slippageBps);
    
    if (!quote) {
      return {
        success: false,
        inputAmount: amount,
        outputAmount: 0,
        error: 'Failed to get swap quote',
      };
    }
    
    logger.info('Quote received', {
      inputAmount: parseInt(quote.inAmount) / 1e9,
      outputAmount: parseInt(quote.outAmount),
      priceImpact: quote.priceImpactPct,
    });
    
    return await this.executeSwap(owner, quote);
  }
  
  // Helper to check if a token is supported by Jupiter
  async isTokenSupported(mint: PublicKey): Promise<boolean> {
    try {
      const tokensUrl = this.isMainnetFork ? MAINNET_TOKENS_API : DEVNET_TOKENS_API;
      const response = await axios.get(tokensUrl);
      
      if (!response.data) return false;
      
      const mintStr = mint.toBase58();
      return response.data.some((token: any) => token.address === mintStr);
    } catch (error) {
      logger.error('Failed to check token support', { error });
      return false;
    }
  }
  
  // Raydium fallback methods for local fork
  private async ensureRaydiumInitialized(owner: Keypair): Promise<Raydium> {
    if (!this.raydium) {
      this.raydium = await Raydium.load({
        connection: this.connection,
        owner,
        disableLoadToken: true,
      });
    }
    return this.raydium;
  }
  
  private async raydiumSwapMikoToSol(
    owner: Keypair,
    mikoMint: PublicKey,
    amount: number,
    slippageBps: number = 100
  ): Promise<JupiterSwapResult> {
    try {
      if (!this.poolId) {
        throw new Error('Pool ID not provided to JupiterAdapter');
      }
      
      logger.info('Executing MIKO -> SOL swap on Raydium CPMM', {
        poolId: this.poolId.toBase58(),
        amount: amount / 1e9
      });
      
      const raydium = await this.ensureRaydiumInitialized(owner);
      
      // Get pool data
      const poolData = await raydium.cpmm.getPoolInfoFromRpc(this.poolId.toBase58());
      if (!poolData) {
        throw new Error('Pool not found');
      }
      
      // MIKO is mintB, so baseIn = false when swapping MIKO
      const baseIn = false;
      const inputAmount = new BN(amount);
      
      // Calculate swap output
      const swapResult = CurveCalculator.swap(
        inputAmount,
        baseIn ? poolData.rpcData.baseReserve : poolData.rpcData.quoteReserve,
        baseIn ? poolData.rpcData.quoteReserve : poolData.rpcData.baseReserve,
        poolData.rpcData.configInfo!.tradeFeeRate
      );
      
      // Create swap transaction
      const { execute, transaction } = await raydium.cpmm.swap({
        poolInfo: poolData.poolInfo,
        poolKeys: poolData.poolKeys,
        txVersion: TxVersion.LEGACY,
        baseIn,
        inputAmount,
        swapResult,
        slippage: 0.5, // 50% slippage for keeper swaps to ensure success
      });
      
      // Send transaction
      const tx = await sendAndConfirmTransaction(
        this.connection,
        transaction as Transaction,
        [owner],
        { commitment: 'confirmed' }
      );
      
      logger.info('Raydium swap successful', {
        txSignature: tx,
        outputAmount: swapResult.destinationAmountSwapped.toNumber() / 1e9
      });
      
      return {
        success: true,
        txSignature: tx,
        inputAmount: amount,
        outputAmount: swapResult.destinationAmountSwapped.toNumber(),
      };
      
    } catch (error) {
      logger.error('Raydium swap failed', { error });
      return {
        success: false,
        inputAmount: amount,
        outputAmount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}