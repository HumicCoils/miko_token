import { PublicKey, Transaction, Keypair } from '@solana/web3.js';

export interface SwapParams {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: number;
  slippageBps: number; // basis points (100 = 1%)
  userPublicKey: PublicKey;
}

export interface SwapQuote {
  inputMint: PublicKey;
  inAmount: number;
  outputMint: PublicKey;
  outAmount: number;
  otherAmountThreshold: number;
  swapMode: 'ExactIn' | 'ExactOut';
  slippageBps: number;
  platformFee: {
    amount: number;
    feeBps: number;
  } | null;
  priceImpactPct: number;
  routePlan: Array<{
    inToken: string;
    outToken: string;
    amount: number;
    outAmount: number;
    priceImpactPct: number;
    marketInfos: Array<{
      id: string;
      label: string;
      inputMint: string;
      outputMint: string;
      notEnoughLiquidity: boolean;
      inAmount: number;
      outAmount: number;
      priceImpactPct: number;
      fee: {
        amount: number;
        mint: string;
        pct: number;
      };
    }>;
  }>;
  contextSlot: number;
  timeTaken: number;
}

export interface SwapResult {
  inputMint: PublicKey;
  inAmount: number;
  outputMint: PublicKey;
  outAmount: number;
  transaction: Transaction;
  signers: Keypair[];
  txid: string;
  confirmed: boolean;
  slot: number;
}

export interface IJupiterAdapter {
  getQuote(params: SwapParams): Promise<SwapQuote>;
  
  swap(quote: SwapQuote, userPublicKey: PublicKey): Promise<SwapResult>;
  
  getTokenPrice(mint: PublicKey): Promise<number | null>;
  
  getTokenList(): Promise<Array<{
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
  }>>;
}