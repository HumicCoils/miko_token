import { Raydium, TxVersion, parseTokenAccountResp, getCpmmPdaAmmConfigId, Percent } from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import Decimal from 'decimal.js';
import BN from 'bn.js';
import { createLogger } from '../../keeper-bot/src/utils/logger';

const logger = createLogger('RaydiumCPMM');

// Raydium CPMM Program ID (mainnet) - supports Token-2022
export const CPMM_PROGRAM_ID = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');

export interface CreateCPMMPoolParams {
  connection: Connection;
  payer: Keypair;
  mintA: PublicKey;        // MIKO mint (Token-2022)
  mintB: PublicKey;        // SOL mint
  mintAAmount: BN;         // Initial MIKO amount
  mintBAmount: BN;         // Initial SOL amount
  startTime?: number;      // Optional start time
}

export interface AddLiquidityParams {
  poolId: PublicKey;
  owner: Keypair;
  amountA: BN;           // MIKO amount
  amountB: BN;           // SOL amount
  slippage: number;      // Slippage tolerance (e.g., 0.01 for 1%)
}

export class RaydiumCPMMIntegration {
  private raydium: Raydium | null = null;
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Initialize Raydium SDK
   */
  async initialize(owner: Keypair): Promise<void> {
    logger.info('Initializing Raydium SDK for CPMM...');
    
    try {
      this.raydium = await Raydium.load({
        connection: this.connection,
        owner,
        cluster: 'mainnet', // Even on local fork, we use mainnet config
        disableFeatureCheck: true,
        disableLoadToken: false,
        blockhashCommitment: 'confirmed',
      });
      
      logger.info('Raydium SDK initialized successfully for CPMM');
    } catch (error) {
      logger.error('Failed to initialize Raydium SDK', { error });
      throw error;
    }
  }

  /**
   * Create a new CPMM pool (supports Token-2022)
   */
  async createCPMMPool(params: CreateCPMMPoolParams): Promise<{
    poolId: PublicKey;
    txId: string;
  }> {
    const { payer, mintA, mintB, mintAAmount, mintBAmount, startTime } = params;
    
    if (!this.raydium) {
      await this.initialize(payer);
    }
    
    logger.info('Creating CPMM pool...');
    logger.info(`Token A (MIKO): ${mintA.toBase58()}`);
    logger.info(`Token B (SOL): ${mintB.toBase58()}`);
    logger.info(`Initial MIKO: ${mintAAmount.toString()}`);
    logger.info(`Initial SOL: ${mintBAmount.toString()}`);
    
    try {
      // Get token info - CPMM handles Token-2022 automatically
      const [tokenInfoA, tokenInfoB] = await Promise.all([
        this.raydium!.token.getTokenInfo(mintA.toBase58()),
        this.raydium!.token.getTokenInfo(mintB.toBase58()),
      ]);

      // Pool fee account for mainnet fork (same as mainnet)
      const poolFeeAccount = new PublicKey('7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5');
      
      // Get CPMM fee configs or use default for local fork
      let feeConfig;
      try {
        const feeConfigs = await this.raydium!.api.getCpmmConfigs();
        // Use the standard 0.25% fee config (tradeFeeRate = 2500)
        feeConfig = feeConfigs.find((c: any) => c.tradeFeeRate === 2500) || feeConfigs[0];
      } catch (error) {
        logger.warn('Failed to fetch CPMM configs from API, using default');
        // Default config for local fork with 0.25% fee
        const configId = getCpmmPdaAmmConfigId(CPMM_PROGRAM_ID, 0).publicKey;
        feeConfig = {
          id: configId.toBase58(),
          index: 0,
          protocolFeeRate: 120000,
          tradeFeeRate: 2500, // 0.25%
          fundFeeRate: 25000,
          createPoolFee: '0.15',
        };
      }
      
      logger.info('Using CPMM fee config:', {
        id: feeConfig.id,
        tradeFeeRate: feeConfig.tradeFeeRate,
        feePercent: feeConfig.tradeFeeRate / 1000000,
      });
      
      // Create the pool using CPMM
      const { execute, extInfo } = await this.raydium!.cpmm.createPool({
        programId: CPMM_PROGRAM_ID,
        poolFeeAccount: poolFeeAccount,
        mintA: tokenInfoA,
        mintB: tokenInfoB,
        mintAAmount: mintAAmount,
        mintBAmount: mintBAmount,
        startTime: startTime ? new BN(startTime) : new BN(0),
        feeConfig: feeConfig,
        associatedOnly: false,
        ownerInfo: {
          useSOLBalance: true, // Use SOL balance for WSOL operations
        },
        // Ensure SOL handling is correct
        mintAUseSOLBalance: false, // MIKO is not SOL
        mintBUseSOLBalance: true,  // SOL should use SOL balance directly
        checkCreateATAOwner: true, // Create ATAs if needed
        txVersion: TxVersion.V0,
        computeBudgetConfig: {
          units: 600000,
          microLamports: 10000,
        },
      });

      // Execute the transaction
      logger.info('Executing CPMM pool creation transaction...');
      const { txId } = await execute({ sendAndConfirm: true });

      const poolId = extInfo.address.poolId;
      logger.info('✅ CPMM pool created successfully!');
      logger.info(`Pool ID: ${poolId.toBase58()}`);
      logger.info(`Transaction: ${txId}`);
      logger.info('Pool Keys:', {
        programId: extInfo.address.programId.toBase58(),
        configId: extInfo.address.configId.toBase58(),
        poolId: poolId.toBase58(),
        mintA: tokenInfoA.address,
        mintB: tokenInfoB.address,
        vaultA: extInfo.address.vaultA.toBase58(),
        vaultB: extInfo.address.vaultB.toBase58(),
        authority: extInfo.address.authority.toBase58(),
      });

      return {
        poolId,
        txId,
      };

    } catch (error) {
      logger.error('Failed to create CPMM pool', { error });
      throw error;
    }
  }

  /**
   * Add liquidity to an existing CPMM pool
   */
  async addLiquidity(params: AddLiquidityParams): Promise<{
    txId: string;
  }> {
    const { poolId, owner, amountA, amountB, slippage } = params;
    
    if (!this.raydium) {
      await this.initialize(owner);
    }
    
    logger.info('Adding liquidity to CPMM pool...');
    logger.info(`Pool ID: ${poolId.toBase58()}`);
    logger.info(`Amount A (MIKO): ${amountA.toString()}`);
    logger.info(`Amount B (SOL): ${amountB.toString()}`);
    
    try {
      // Get pool info from RPC (for immediate access)
      const poolData = await this.raydium!.cpmm.getPoolInfoFromRpc(poolId.toBase58());
      
      if (!poolData) {
        throw new Error('Pool not found');
      }

      // Add liquidity using the correct method name
      const { execute } = await this.raydium!.cpmm.addLiquidity({
        poolInfo: poolData.poolInfo,
        poolKeys: poolData.poolKeys, // Optional but helpful for performance
        inputAmount: amountA, // Use BN directly
        baseIn: true, // true if inputAmount is token A (MIKO)
        slippage: new Percent(Math.floor(slippage * 10000), 10000), // Convert to Percent type
        txVersion: TxVersion.V0,
        computeBudgetConfig: {
          units: 400000,
          microLamports: 10000,
        },
      });

      // Execute the transaction
      logger.info('Executing add liquidity transaction...');
      const { txId } = await execute({ sendAndConfirm: true });

      logger.info('✅ Liquidity added successfully!');
      logger.info(`Transaction: ${txId}`);

      return {
        txId,
      };

    } catch (error) {
      logger.error('Failed to add liquidity', { error });
      throw error;
    }
  }
}

// Export the standard pool fee account
export const CPMM_POOL_FEE_ACCOUNT = {
  MAINNET: '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5',
  DEVNET: '3XMrhbv989VxAMi3DErLV9eJht1pHppW5LbKxe9fkEFR',
};