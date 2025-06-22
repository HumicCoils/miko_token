import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config';

interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}

interface SwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
}

export class JupiterClient {
  private client: AxiosInstance;
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
    this.client = axios.create({
      baseURL: 'https://quote-api.jup.ag/v6',
      timeout: 30000,
    });
  }

  /**
   * Get quote for token swap
   */
  async getQuote(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number,
    slippageBps: number = 50 // 0.5% default slippage
  ): Promise<QuoteResponse> {
    try {
      const params = {
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        amount: Math.floor(amount * 1e9).toString(), // Convert to lamports
        slippageBps: slippageBps,
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
      };

      const response = await this.client.get<QuoteResponse>('/quote', { params });
      
      logger.info('Jupiter quote received:', {
        inAmount: response.data.inAmount,
        outAmount: response.data.outAmount,
        priceImpact: response.data.priceImpactPct,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get Jupiter quote:', error);
      throw error;
    }
  }

  /**
   * Execute token swap
   */
  async swap(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number,
    userPublicKey: string,
    slippageBps: number = 50
  ): Promise<{ txId: string; outAmount: string }> {
    try {
      // Get quote first
      const quote = await this.getQuote(inputMint, outputMint, amount, slippageBps);
      
      // Get swap transaction
      const swapResponse = await this.client.post<SwapResponse>('/swap', {
        quoteResponse: quote,
        userPublicKey: userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      });

      // Deserialize and send transaction
      const swapTransactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      
      // Sign and send transaction
      // Note: In production, this would be signed by the treasury wallet
      const txId = await this.sendTransaction(transaction);
      
      logger.info(`Swap executed successfully: ${txId}`);
      
      return {
        txId,
        outAmount: quote.outAmount,
      };
    } catch (error) {
      logger.error('Failed to execute swap:', error);
      throw error;
    }
  }

  /**
   * Send transaction with retry logic
   */
  private async sendTransaction(transaction: VersionedTransaction): Promise<string> {
    const maxRetries = 3;
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const simulation = await this.connection.simulateTransaction(transaction);
        
        if (simulation.value.err) {
          throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
        }

        const signature = await this.connection.sendTransaction(transaction, {
          maxRetries: 3,
          skipPreflight: false,
        });

        // Wait for confirmation
        const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
        
        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }

        return signature;
      } catch (error) {
        logger.warn(`Transaction attempt ${i + 1} failed:`, error);
        lastError = error;
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }

    throw lastError;
  }

  /**
   * Get token account balance
   */
  async getTokenBalance(tokenMint: PublicKey, owner: PublicKey): Promise<number> {
    try {
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(owner, {
        mint: tokenMint,
      });

      if (tokenAccounts.value.length === 0) {
        return 0;
      }

      const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
      return balance || 0;
    } catch (error) {
      logger.error('Failed to get token balance:', error);
      return 0;
    }
  }
}