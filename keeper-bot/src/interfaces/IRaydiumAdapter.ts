import { PublicKey, Keypair, Transaction } from '@solana/web3.js';

export interface PoolCreationParams {
  tokenA: PublicKey;
  tokenB: PublicKey;
  feeTier: number; // 0.25 for standard, 1 for exotic
  initialPrice: number;
  priceRangePercent: number; // e.g., 5 for ±5%
  initialLiquidityA: number;
  initialLiquidityB: number;
  owner: PublicKey;
}

export interface LiquidityAddParams {
  poolId: PublicKey;
  amountA: number;
  amountB: number;
  owner: PublicKey;
  newPriceRange?: number; // Optional: new price range percentage
}

export interface PoolInfo {
  poolId: PublicKey;
  tokenA: PublicKey;
  tokenB: PublicKey;
  price: number;
  liquidity: number;
  volume24h: number;
  priceRange: {
    low: number;
    high: number;
    timestamp: number;
  };
}

export interface IRaydiumAdapter {
  createCLMMPool(params: PoolCreationParams): Promise<{
    poolId: PublicKey;
    transaction: Transaction;
    signers: Keypair[];
  }>;

  addLiquidity(params: LiquidityAddParams): Promise<{
    transaction: Transaction;
    signers: Keypair[];
  }>;

  getPoolInfo(poolId: PublicKey): Promise<PoolInfo | null>;

  simulateTrade(params: {
    poolId: PublicKey;
    inputToken: PublicKey;
    inputAmount: number;
    slippageBps: number;
  }): Promise<{
    outputAmount: number;
    priceImpact: number;
    fee: number;
  }>;
}