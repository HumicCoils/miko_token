import { PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { IRaydiumAdapter, PoolCreationParams, LiquidityAddParams, PoolInfo } from '../interfaces/IRaydiumAdapter';

interface MockPool {
  poolId: string;
  tokenA: PublicKey;
  tokenB: PublicKey;
  liquidity: Map<string, number>;
  price: number;
  volume24h: number;
  createdAt: number;
  priceRanges: Array<{low: number; high: number; timestamp: number}>;
}

export class MockRaydiumAdapter implements IRaydiumAdapter {
  private mockPools: Map<string, MockPool> = new Map();
  private mockTransactionCounter = 0;

  async createCLMMPool(params: PoolCreationParams): Promise<{
    poolId: PublicKey;
    transaction: Transaction;
    signers: Keypair[];
  }> {
    // Generate mock pool ID
    const poolId = Keypair.generate().publicKey;
    
    // Create mock pool
    const mockPool: MockPool = {
      poolId: poolId.toBase58(),
      tokenA: params.tokenA,
      tokenB: params.tokenB,
      liquidity: new Map(),
      price: params.initialPrice,
      volume24h: 0,
      createdAt: Date.now(),
      priceRanges: [{
        low: params.initialPrice * (1 - params.priceRangePercent / 100),
        high: params.initialPrice * (1 + params.priceRangePercent / 100),
        timestamp: Date.now()
      }]
    };

    // Store initial liquidity
    mockPool.liquidity.set(params.owner.toBase58(), params.initialLiquidityA);
    
    this.mockPools.set(poolId.toBase58(), mockPool);

    // Create mock transaction
    const transaction = new Transaction();
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: params.owner,
        toPubkey: poolId,
        lamports: 1000000, // Mock rent
      })
    );

    console.log(`[MockRaydium] Created CLMM pool: ${poolId.toBase58()}`);
    console.log(`[MockRaydium] Initial price: ${params.initialPrice}`);
    console.log(`[MockRaydium] Price range: ±${params.priceRangePercent}%`);
    console.log(`[MockRaydium] Fee tier: ${params.feeTier}%`);

    return {
      poolId,
      transaction,
      signers: []
    };
  }

  async addLiquidity(params: LiquidityAddParams): Promise<{
    transaction: Transaction;
    signers: Keypair[];
  }> {
    const pool = this.mockPools.get(params.poolId.toBase58());
    if (!pool) {
      throw new Error(`Pool ${params.poolId.toBase58()} not found`);
    }

    // Update liquidity
    const currentLiquidity = pool.liquidity.get(params.owner.toBase58()) || 0;
    pool.liquidity.set(params.owner.toBase58(), currentLiquidity + params.amountA);

    // Update price range if needed
    if (params.newPriceRange) {
      pool.priceRanges.push({
        low: pool.price * (1 - params.newPriceRange / 100),
        high: pool.price * (1 + params.newPriceRange / 100),
        timestamp: Date.now()
      });
    }

    // Create mock transaction
    const transaction = new Transaction();
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: params.owner,
        toPubkey: params.poolId,
        lamports: 1, // Mock fee
      })
    );

    const elapsed = (Date.now() - pool.createdAt) / 1000;
    console.log(`[MockRaydium] Added liquidity to pool: ${params.poolId.toBase58()}`);
    console.log(`[MockRaydium] Amount: ${params.amountA}`);
    console.log(`[MockRaydium] Time since creation: ${elapsed.toFixed(1)}s`);
    if (params.newPriceRange) {
      console.log(`[MockRaydium] New price range: ±${params.newPriceRange}%`);
    }

    return {
      transaction,
      signers: []
    };
  }

  async getPoolInfo(poolId: PublicKey): Promise<PoolInfo | null> {
    const pool = this.mockPools.get(poolId.toBase58());
    if (!pool) {
      return null;
    }

    const totalLiquidity = Array.from(pool.liquidity.values()).reduce((a, b) => a + b, 0);

    return {
      poolId,
      tokenA: pool.tokenA,
      tokenB: pool.tokenB,
      price: pool.price,
      liquidity: totalLiquidity,
      volume24h: pool.volume24h,
      priceRange: pool.priceRanges[pool.priceRanges.length - 1]
    };
  }

  async simulateTrade(params: {
    poolId: PublicKey;
    inputToken: PublicKey;
    inputAmount: number;
    slippageBps: number;
  }): Promise<{
    outputAmount: number;
    priceImpact: number;
    fee: number;
  }> {
    const pool = this.mockPools.get(params.poolId.toBase58());
    if (!pool) {
      throw new Error(`Pool ${params.poolId.toBase58()} not found`);
    }

    // Mock trade simulation
    const feeRate = 0.0025; // 0.25% fee
    const fee = params.inputAmount * feeRate;
    const outputAmount = (params.inputAmount - fee) * pool.price;
    const priceImpact = 0.01; // Mock 1% price impact

    // Update volume
    pool.volume24h += params.inputAmount;

    return {
      outputAmount,
      priceImpact,
      fee
    };
  }

  // Test helper methods
  setPoolPrice(poolId: PublicKey, newPrice: number): void {
    const pool = this.mockPools.get(poolId.toBase58());
    if (pool) {
      pool.price = newPrice;
    }
  }

  getPoolCreationTime(poolId: PublicKey): number | null {
    const pool = this.mockPools.get(poolId.toBase58());
    return pool ? pool.createdAt : null;
  }

  getAllPools(): Map<string, MockPool> {
    return this.mockPools;
  }
}