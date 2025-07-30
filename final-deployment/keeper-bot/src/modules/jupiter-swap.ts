import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
import axios from 'axios';
import { Logger } from '../utils/logger';

interface SwapResult {
  success: boolean;
  outputAmount: number;
  signature?: string;
  error?: string;
}

interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: any;
  priceImpactPct: string;
  routePlan: any[];
}

export class JupiterSwap {
  private connection: Connection;
  private wallet: Keypair;
  private config: any;
  private logger: Logger;
  private jupiterApi: string;
  
  constructor(connection: Connection, wallet: Keypair, config: any) {
    this.connection = connection;
    this.wallet = wallet;
    this.config = config;
    this.logger = new Logger('JupiterSwap');
    this.jupiterApi = 'https://quote-api.jup.ag/v6';
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
   * Generic token swap
   */
  async swapTokens(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number,
    userPublicKey: PublicKey
  ): Promise<SwapResult> {
    try {
      this.logger.info('Initiating swap', {
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        amount: amount / 1e9,
        user: userPublicKey.toBase58()
      });
      
      // Get quote
      const quote = await this.getQuote(inputMint, outputMint, amount);
      if (!quote) {
        return { success: false, outputAmount: 0, error: 'Failed to get quote' };
      }
      
      const outputAmount = parseInt(quote.outAmount);
      const priceImpact = parseFloat(quote.priceImpactPct);
      
      this.logger.info('Quote received', {
        inputAmount: amount / 1e9,
        outputAmount: outputAmount / 1e9,
        priceImpact: `${priceImpact}%`,
        slippage: `${quote.slippageBps / 100}%`
      });
      
      // Check price impact
      if (priceImpact > 5) {
        this.logger.warn('High price impact detected', { priceImpact });
        // Could add logic to split into smaller swaps
      }
      
      // Get swap transaction
      const swapTransaction = await this.getSwapTransaction(quote, userPublicKey);
      if (!swapTransaction) {
        return { success: false, outputAmount: 0, error: 'Failed to get swap transaction' };
      }
      
      // Check and create output token account if needed
      const outputTokenAccount = getAssociatedTokenAddressSync(
        outputMint,
        userPublicKey,
        false,
        outputMint.equals(new PublicKey('So11111111111111111111111111111111111112')) 
          ? TOKEN_PROGRAM_ID 
          : TOKEN_2022_PROGRAM_ID
      );
      
      const outputAccountInfo = await this.connection.getAccountInfo(outputTokenAccount);
      if (!outputAccountInfo) {
        const createAtaIx = createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          outputTokenAccount,
          userPublicKey,
          outputMint,
          outputMint.equals(new PublicKey('So11111111111111111111111111111111111112')) 
            ? TOKEN_PROGRAM_ID 
            : TOKEN_2022_PROGRAM_ID
        );
        swapTransaction.add(createAtaIx);
      }
      
      // Add priority fee
      swapTransaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: this.config.jupiter.priority_fee_lamports || 5000,
        })
      );
      
      // Send transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        swapTransaction,
        [this.wallet],
        {
          commitment: 'confirmed',
          skipPreflight: false
        }
      );
      
      this.logger.info('Swap completed', {
        signature,
        inputAmount: amount / 1e9,
        outputAmount: outputAmount / 1e9
      });
      
      return {
        success: true,
        outputAmount,
        signature
      };
      
    } catch (error: any) {
      this.logger.error('Swap failed', {
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
   * Get quote from Jupiter
   */
  private async getQuote(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number
  ): Promise<JupiterQuote | null> {
    try {
      const params = {
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        amount: amount.toString(),
        slippageBps: this.config.jupiter.slippage_bps || 100, // 1% default
        onlyDirectRoutes: false,
        asLegacyTransaction: false
      };
      
      const response = await axios.get(`${this.jupiterApi}/quote`, { params });
      
      if (!response.data) {
        this.logger.error('No quote data received');
        return null;
      }
      
      return response.data;
      
    } catch (error: any) {
      this.logger.error('Failed to get quote', {
        error: error.message,
        response: error.response?.data
      });
      return null;
    }
  }
  
  /**
   * Get swap transaction from Jupiter
   */
  private async getSwapTransaction(
    quote: JupiterQuote,
    userPublicKey: PublicKey
  ): Promise<Transaction | null> {
    try {
      const swapRequest = {
        quoteResponse: quote,
        userPublicKey: userPublicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto'
      };
      
      const response = await axios.post(
        `${this.jupiterApi}/swap`,
        swapRequest,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.data?.swapTransaction) {
        this.logger.error('No swap transaction received');
        return null;
      }
      
      // Deserialize the transaction
      const swapTransactionBuf = Buffer.from(response.data.swapTransaction, 'base64');
      const transaction = Transaction.from(swapTransactionBuf);
      
      return transaction;
      
    } catch (error: any) {
      this.logger.error('Failed to get swap transaction', {
        error: error.message,
        response: error.response?.data
      });
      return null;
    }
  }
  
  /**
   * Get token price for calculation
   */
  async getTokenPrice(mint: PublicKey): Promise<number> {
    try {
      // Use Jupiter price API
      const response = await axios.get(
        `https://price.jup.ag/v4/price?ids=${mint.toBase58()}`
      );
      
      if (!response.data?.data?.[mint.toBase58()]) {
        throw new Error('Price not found');
      }
      
      return response.data.data[mint.toBase58()].price;
      
    } catch (error) {
      this.logger.error('Failed to get token price', {
        mint: mint.toBase58(),
        error
      });
      return 0;
    }
  }
  
  /**
   * Validate swap parameters
   */
  private validateSwapParams(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number
  ): boolean {
    if (amount <= 0) {
      this.logger.error('Invalid swap amount', { amount });
      return false;
    }
    
    if (inputMint.equals(outputMint)) {
      this.logger.error('Input and output mints are the same');
      return false;
    }
    
    return true;
  }
}