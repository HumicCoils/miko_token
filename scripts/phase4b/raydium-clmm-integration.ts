import { Raydium, TxVersion, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import Decimal from 'decimal.js';
import BN from 'bn.js';
import { createLogger } from '../../keeper-bot/src/utils/logger';

const logger = createLogger('RaydiumCLMM');

// Raydium CLMM Program ID (mainnet)
export const CLMM_PROGRAM_ID = new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK');

export interface CreateCLMMPoolParams {
  connection: Connection;
  payer: Keypair;
  mintA: PublicKey;        // MIKO mint (Token-2022)
  mintB: PublicKey;        // SOL mint
  initialPrice: number;    // Initial price in B per A (SOL per MIKO)
  feeTier: number;         // Fee tier in basis points (e.g., 25 for 0.25%)
}

export interface AddLiquidityParams {
  poolId: PublicKey;
  owner: Keypair;
  amountA: BN;           // MIKO amount
  amountB: BN;           // SOL amount
  priceLower: number;    // Lower price bound
  priceUpper: number;    // Upper price bound
  slippage: number;      // Slippage tolerance (e.g., 0.01 for 1%)
}

export class RaydiumCLMMIntegration {
  private raydium: Raydium | null = null;
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Initialize Raydium SDK
   */
  async initialize(owner: Keypair): Promise<void> {
    logger.info('Initializing Raydium SDK...');
    
    try {
      this.raydium = await Raydium.load({
        connection: this.connection,
        owner,
        cluster: 'mainnet', // Even on local fork, we use mainnet config
        disableFeatureCheck: true,
        disableLoadToken: false,
      });
      
      logger.info('Raydium SDK initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Raydium SDK', { error });
      throw error;
    }
  }

  /**
   * Create a new CLMM pool
   */
  async createCLMMPool(params: CreateCLMMPoolParams): Promise<{
    poolId: PublicKey;
    txId: string;
  }> {
    const { connection, payer, mintA, mintB, initialPrice, feeTier } = params;

    if (!this.raydium) {
      await this.initialize(payer);
    }

    logger.info('Creating CLMM pool...');
    logger.info(`Token A (MIKO): ${mintA.toBase58()}`);
    logger.info(`Token B (SOL): ${mintB.toBase58()}`);
    logger.info(`Initial price: ${initialPrice} SOL per MIKO`);
    logger.info(`Fee tier: ${feeTier} basis points (${feeTier / 100}%)`);

    try {
      // Get token info
      const [tokenInfoA, tokenInfoB] = await Promise.all([
        this.raydium!.token.getTokenInfo(mintA.toBase58()),
        this.raydium!.token.getTokenInfo(mintB.toBase58()),
      ]);

      // Get CLMM configs from API (or use hardcoded for local fork)
      let clmmConfigs;
      try {
        clmmConfigs = await this.raydium!.api.getClmmConfigs();
      } catch (error) {
        logger.warn('Failed to fetch CLMM configs from API, using defaults');
        // Default config for local testing
        clmmConfigs = [{
          id: 'CXrumVvh9qUPxLKb1KVxJSEa8isfYEJDaYXnAWktFHdo', // Default config
          index: 0,
          protocolFeeRate: 12000, // 1.2%
          tradeFeeRate: feeTier,
          tickSpacing: this.getTickSpacing(feeTier),
          fundFeeRate: 40000, // 40%
          fundOwner: '', // Required field, will be set by program
          description: '', // Required field
        }];
      }

      // Find matching config or use first one
      const ammConfig = clmmConfigs.find((c: any) => c.tradeFeeRate === feeTier) || clmmConfigs[0];

      logger.info('Using AMM config:', {
        id: ammConfig.id,
        tradeFeeRate: ammConfig.tradeFeeRate,
        tickSpacing: ammConfig.tickSpacing,
      });

      // Create the pool
      const startTime = new BN(0); // Start immediately
      
      const { execute, extInfo } = await this.raydium!.clmm.createPool({
        programId: CLMM_PROGRAM_ID,
        mint1: tokenInfoA,
        mint2: tokenInfoB,
        ammConfig: {
          ...ammConfig,
          id: new PublicKey(ammConfig.id),
          fundOwner: (ammConfig as any).fundOwner || '',
          description: (ammConfig as any).description || '',
        } as any,
        initialPrice: new Decimal(initialPrice),
        txVersion: TxVersion.V0,
        computeBudgetConfig: {
          units: 600000,
          microLamports: 10000,
        },
      });

      // Execute the transaction
      logger.info('Executing pool creation transaction...');
      const { txId } = await execute({ sendAndConfirm: true });

      const poolId = (extInfo as any).poolId || (extInfo as any).address?.poolId;
      logger.info('✅ CLMM pool created successfully!');
      logger.info(`Pool ID: ${poolId.toBase58()}`);
      logger.info(`Transaction: ${txId}`);

      return {
        poolId,
        txId,
      };

    } catch (error) {
      logger.error('Failed to create CLMM pool', { error });
      throw error;
    }
  }

  /**
   * Add liquidity to an existing CLMM pool
   */
  async addLiquidity(params: AddLiquidityParams): Promise<{
    positionId: PublicKey;
    txId: string;
  }> {
    const { poolId, owner, amountA, amountB, priceLower, priceUpper, slippage } = params;

    if (!this.raydium) {
      await this.initialize(owner);
    }

    logger.info('Adding liquidity to CLMM pool...');
    logger.info(`Pool ID: ${poolId.toBase58()}`);
    logger.info(`Amount A (MIKO): ${amountA.toString()}`);
    logger.info(`Amount B (SOL): ${amountB.toString()}`);
    logger.info(`Price range: ${priceLower} - ${priceUpper} SOL per MIKO`);

    try {
      // Get pool info
      const poolData = await this.raydium!.clmm.getPoolInfoFromRpc(poolId.toBase58());
      
      if (!poolData) {
        throw new Error('Pool not found');
      }

      const poolInfo = poolData.poolInfo;
      const poolKeys = poolData.poolKeys;

      // Calculate ticks from prices
      const tickLower = this.priceToTick(
        priceLower, 
        poolInfo.mintA.decimals, 
        poolInfo.mintB.decimals
      );
      const tickUpper = this.priceToTick(
        priceUpper, 
        poolInfo.mintA.decimals, 
        poolInfo.mintB.decimals
      );

      // Round ticks to valid spacing
      const tickSpacing = poolInfo.config.tickSpacing;
      const tickLowerRounded = Math.floor(tickLower / tickSpacing) * tickSpacing;
      const tickUpperRounded = Math.ceil(tickUpper / tickSpacing) * tickSpacing;

      logger.info(`Tick range: ${tickLowerRounded} - ${tickUpperRounded}`);

      // Open position and add liquidity
      const { execute, extInfo } = await this.raydium!.clmm.openPositionFromBase({
        poolInfo,
        poolKeys,
        ownerInfo: {
          useSOLBalance: true, // Use SOL balance directly
        },
        tickLower: tickLowerRounded,
        tickUpper: tickUpperRounded,
        base: 'MintA', // We're always providing MIKO (MintA) as the base amount
        baseAmount: amountA,
        otherAmountMax: amountB.mul(new BN(1 + slippage)), // Add slippage
        txVersion: TxVersion.V0,
        computeBudgetConfig: {
          units: 600000,
          microLamports: 10000,
        },
      });

      // Execute the transaction
      logger.info('Executing liquidity addition transaction...');
      const { txId } = await execute({ sendAndConfirm: true });

      const positionId = extInfo.nftMint;
      logger.info('✅ Liquidity added successfully!');
      logger.info(`Position NFT: ${positionId.toBase58()}`);
      logger.info(`Transaction: ${txId}`);

      return {
        positionId,
        txId,
      };

    } catch (error) {
      logger.error('Failed to add liquidity', { error });
      throw error;
    }
  }

  /**
   * Get pool information
   */
  async getPoolInfo(poolId: PublicKey): Promise<any> {
    if (!this.raydium) {
      throw new Error('Raydium SDK not initialized');
    }

    const poolData = await this.raydium.clmm.getPoolInfoFromRpc(poolId.toBase58());
    
    if (!poolData) {
      throw new Error('Pool not found');
    }

    const poolInfo = poolData.poolInfo;

    const currentPrice = this.tickToPrice(
      (poolInfo as any).tickCurrent || (poolInfo as any).tick || 0,
      poolInfo.mintA.decimals,
      poolInfo.mintB.decimals
    );

    return {
      poolId: poolId.toBase58(),
      mintA: poolInfo.mintA.address,
      mintB: poolInfo.mintB.address,
      currentTick: (poolInfo as any).tickCurrent || (poolInfo as any).tick || 0,
      currentPrice,
      liquidity: ((poolInfo as any).liquidity || (poolInfo as any).tvl || '0').toString(),
      feeRate: poolInfo.config?.tradeFeeRate || (poolInfo as any).tradeFeeRate || 0,
      tickSpacing: poolInfo.config?.tickSpacing || (poolInfo as any).tickSpacing || 0,
    };
  }

  /**
   * Convert price to tick
   */
  private priceToTick(price: number, decimalsA: number, decimalsB: number): number {
    const adjustedPrice = price * Math.pow(10, decimalsB - decimalsA);
    const tick = Math.log(adjustedPrice) / Math.log(1.0001);
    return Math.round(tick);
  }

  /**
   * Convert tick to price
   */
  private tickToPrice(tick: number, decimalsA: number, decimalsB: number): number {
    const price = Math.pow(1.0001, tick);
    return price / Math.pow(10, decimalsB - decimalsA);
  }

  /**
   * Get tick spacing for fee tier
   */
  private getTickSpacing(feeTier: number): number {
    // Standard Raydium tick spacings
    switch (feeTier) {
      case 1: return 1;       // 0.01% - stable
      case 5: return 1;       // 0.05% - stable
      case 25: return 5;      // 0.25% - standard
      case 100: return 10;    // 1% - volatile
      case 200: return 20;    // 2% - exotic
      default: return 10;     // Default
    }
  }
}

// Export fee tiers
export const RAYDIUM_FEE_TIERS = {
  STABLE_0_01: 1,      // 0.01%
  STABLE_0_05: 5,      // 0.05%
  STANDARD: 25,        // 0.25%
  VOLATILE: 100,       // 1%
  EXOTIC: 200,         // 2%
};