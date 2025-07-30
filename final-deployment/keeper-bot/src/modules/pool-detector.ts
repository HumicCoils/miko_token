import { 
  Connection, 
  PublicKey,
  GetProgramAccountsFilter
} from '@solana/web3.js';
import { 
  LIQUIDITY_STATE_LAYOUT_V4,
  MARKET_STATE_LAYOUT_V3
} from '@raydium-io/raydium-sdk';
import { Logger } from '../utils/logger';

export class PoolDetector {
  private connection: Connection;
  private logger: Logger;
  private detectedPools: Set<string> = new Set();
  
  // Raydium program IDs
  private readonly RAYDIUM_LIQUIDITY_POOL_V4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
  private readonly RAYDIUM_CPMM_PROGRAM = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
  private readonly RAYDIUM_CLMM_PROGRAM = new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK');
  
  constructor(connection: Connection, logger: Logger) {
    this.connection = connection;
    this.logger = logger;
  }
  
  /**
   * Detect new pools for a given token mint
   * These will be excluded from reward distributions
   */
  async detectNewPools(tokenMint: PublicKey): Promise<PublicKey[]> {
    const newPools: PublicKey[] = [];
    
    try {
      this.logger.info('Starting pool detection for reward exclusions', {
        tokenMint: tokenMint.toBase58()
      });
      
      // Detect Raydium V2 AMM pools
      const v2Pools = await this.detectRaydiumV2Pools(tokenMint);
      for (const pool of v2Pools) {
        if (!this.detectedPools.has(pool.toBase58())) {
          newPools.push(pool);
          this.detectedPools.add(pool.toBase58());
        }
      }
      
      // Detect Raydium CPMM pools
      const cpmmPools = await this.detectRaydiumCpmmPools(tokenMint);
      for (const pool of cpmmPools) {
        if (!this.detectedPools.has(pool.toBase58())) {
          newPools.push(pool);
          this.detectedPools.add(pool.toBase58());
        }
      }
      
      // Detect Raydium CLMM pools
      const clmmPools = await this.detectRaydiumClmmPools(tokenMint);
      for (const pool of clmmPools) {
        if (!this.detectedPools.has(pool.toBase58())) {
          newPools.push(pool);
          this.detectedPools.add(pool.toBase58());
        }
      }
      
      if (newPools.length > 0) {
        this.logger.info('New pools detected for reward exclusion', {
          count: newPools.length,
          pools: newPools.map(p => p.toBase58())
        });
      } else {
        this.logger.debug('No new pools detected');
      }
      
      return newPools;
    } catch (error) {
      this.logger.error('Failed to detect pools', error);
      return [];
    }
  }
  
  /**
   * Detect Raydium V2 AMM pools
   */
  private async detectRaydiumV2Pools(tokenMint: PublicKey): Promise<PublicKey[]> {
    try {
      const pools: PublicKey[] = [];
      
      // Check for pools where token is base mint
      const baseFilters: GetProgramAccountsFilter[] = [
        {
          dataSize: LIQUIDITY_STATE_LAYOUT_V4.span,
        },
        {
          memcmp: {
            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('baseMint'),
            bytes: tokenMint.toBase58(),
          },
        },
      ];
      
      const baseAccounts = await this.connection.getProgramAccounts(
        this.RAYDIUM_LIQUIDITY_POOL_V4,
        { filters: baseFilters }
      );
      
      for (const account of baseAccounts) {
        const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(account.account.data);
        
        // Verify this is a valid pool with our token
        if (poolState.baseMint.equals(tokenMint) || poolState.quoteMint.equals(tokenMint)) {
          pools.push(account.pubkey);
          
          this.logger.debug('Found Raydium V2 pool', {
            pool: account.pubkey.toBase58(),
            baseMint: poolState.baseMint.toBase58(),
            quoteMint: poolState.quoteMint.toBase58(),
            baseReserve: poolState.baseReserve.toString(),
            quoteReserve: poolState.quoteReserve.toString()
          });
        }
      }
      
      // Check for pools where token is quote mint
      const quoteFilters: GetProgramAccountsFilter[] = [
        {
          dataSize: LIQUIDITY_STATE_LAYOUT_V4.span,
        },
        {
          memcmp: {
            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'),
            bytes: tokenMint.toBase58(),
          },
        },
      ];
      
      const quoteAccounts = await this.connection.getProgramAccounts(
        this.RAYDIUM_LIQUIDITY_POOL_V4,
        { filters: quoteFilters }
      );
      
      for (const account of quoteAccounts) {
        const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(account.account.data);
        
        // Avoid duplicates
        if (!pools.some(p => p.equals(account.pubkey))) {
          pools.push(account.pubkey);
          
          this.logger.debug('Found Raydium V2 pool (as quote)', {
            pool: account.pubkey.toBase58(),
            baseMint: poolState.baseMint.toBase58(),
            quoteMint: poolState.quoteMint.toBase58()
          });
        }
      }
      
      return pools;
    } catch (error) {
      this.logger.error('Failed to detect Raydium V2 pools', error);
      return [];
    }
  }
  
  /**
   * Detect Raydium CPMM pools
   */
  private async detectRaydiumCpmmPools(tokenMint: PublicKey): Promise<PublicKey[]> {
    try {
      // CPMM pools have a specific account structure
      // We need to find pools that contain our token
      const accounts = await this.connection.getProgramAccounts(
        this.RAYDIUM_CPMM_PROGRAM,
        {
          filters: [
            {
              dataSize: 680 // CPMM pool state size
            }
          ]
        }
      );
      
      const pools: PublicKey[] = [];
      
      for (const account of accounts) {
        try {
          // Parse CPMM pool state
          const data = account.account.data;
          
          // CPMM pool state layout:
          // Discriminator: 8 bytes
          // Config ID: 32 bytes (offset 8)
          // Pool Creator: 32 bytes (offset 40)
          // Token0 Mint: 32 bytes (offset 72)
          // Token1 Mint: 32 bytes (offset 104)
          // Token0 Vault: 32 bytes (offset 136)
          // Token1 Vault: 32 bytes (offset 168)
          // LP Mint: 32 bytes (offset 200)
          // Token0 Decimals: 1 byte (offset 232)
          // Token1 Decimals: 1 byte (offset 233)
          // LP Decimals: 1 byte (offset 234)
          // Bump: 1 byte (offset 235)
          // Status: 1 byte (offset 236)
          // LP Supply: 8 bytes (offset 237)
          // Protocol Fees Token0: 8 bytes (offset 245)
          // Protocol Fees Token1: 8 bytes (offset 253)
          // Fund Fees Token0: 8 bytes (offset 261)
          // Fund Fees Token1: 8 bytes (offset 269)
          // Open Time: 8 bytes (offset 277)
          // Padding: 395 bytes (offset 285)
          
          // Validate discriminator (first 8 bytes should match CPMM pool discriminator)
          const discriminator = data.slice(0, 8);
          // CPMM pool discriminator: [254, 206, 76, 6, 98, 246, 220, 140]
          const expectedDiscriminator = Buffer.from([254, 206, 76, 6, 98, 246, 220, 140]);
          if (!discriminator.equals(expectedDiscriminator)) {
            continue;
          }
          
          const token0 = new PublicKey(data.slice(72, 104));
          const token1 = new PublicKey(data.slice(104, 136));
          
          // Check pool status (offset 236)
          const status = data[236];
          // Status values: 1 = Uninitialized, 2 = Initialized, 3 = Disabled, 4 = RemoveLiquidityOnly
          if (status !== 2) {
            this.logger.debug('Skipping non-initialized CPMM pool', {
              pool: account.pubkey.toBase58(),
              status
            });
            continue;
          }
          
          if (token0.equals(tokenMint) || token1.equals(tokenMint)) {
            pools.push(account.pubkey);
            
            const lpSupply = data.readBigUInt64LE(237);
            const openTime = data.readBigInt64LE(277);
            
            this.logger.debug('Found Raydium CPMM pool', {
              pool: account.pubkey.toBase58(),
              token0: token0.toBase58(),
              token1: token1.toBase58(),
              status,
              lpSupply: lpSupply.toString(),
              openTime: new Date(Number(openTime) * 1000).toISOString()
            });
          }
        } catch (parseError) {
          // Skip invalid accounts
          this.logger.debug('Failed to parse CPMM account', {
            account: account.pubkey.toBase58(),
            error: parseError
          });
          continue;
        }
      }
      
      return pools;
    } catch (error) {
      this.logger.error('Failed to detect Raydium CPMM pools', error);
      return [];
    }
  }
  
  /**
   * Detect Raydium CLMM (Concentrated Liquidity) pools
   */
  private async detectRaydiumClmmPools(tokenMint: PublicKey): Promise<PublicKey[]> {
    try {
      const accounts = await this.connection.getProgramAccounts(
        this.RAYDIUM_CLMM_PROGRAM,
        {
          filters: [
            {
              dataSize: 1544 // CLMM pool state size
            }
          ]
        }
      );
      
      const pools: PublicKey[] = [];
      
      for (const account of accounts) {
        try {
          const data = account.account.data;
          
          // CLMM pool state layout offsets
          const token0Offset = 64;
          const token1Offset = 96;
          
          const token0 = new PublicKey(data.slice(token0Offset, token0Offset + 32));
          const token1 = new PublicKey(data.slice(token1Offset, token1Offset + 32));
          
          if (token0.equals(tokenMint) || token1.equals(tokenMint)) {
            pools.push(account.pubkey);
            
            this.logger.debug('Found Raydium CLMM pool', {
              pool: account.pubkey.toBase58(),
              token0: token0.toBase58(),
              token1: token1.toBase58()
            });
          }
        } catch (parseError) {
          continue;
        }
      }
      
      return pools;
    } catch (error) {
      this.logger.error('Failed to detect Raydium CLMM pools', error);
      return [];
    }
  }
  
  /**
   * Get pool info for a specific pool
   */
  async getPoolInfo(poolAddress: PublicKey): Promise<any> {
    try {
      const accountInfo = await this.connection.getAccountInfo(poolAddress);
      if (!accountInfo) {
        return null;
      }
      
      // Check if it's a V2 AMM pool
      if (accountInfo.owner.equals(this.RAYDIUM_LIQUIDITY_POOL_V4)) {
        const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(accountInfo.data);
        return {
          type: 'raydium-v2',
          baseMint: poolState.baseMint.toBase58(),
          quoteMint: poolState.quoteMint.toBase58(),
          lpSupply: poolState.lpSupply.toString(),
          baseReserve: poolState.baseReserve.toString(),
          quoteReserve: poolState.quoteReserve.toString(),
          status: poolState.status
        };
      }
      
      // Check if it's a CPMM pool
      if (accountInfo.owner.equals(this.RAYDIUM_CPMM_PROGRAM)) {
        const data = accountInfo.data;
        const token0 = new PublicKey(data.slice(72, 104));
        const token1 = new PublicKey(data.slice(104, 136));
        
        return {
          type: 'raydium-cpmm',
          token0: token0.toBase58(),
          token1: token1.toBase58()
        };
      }
      
      // Check if it's a CLMM pool
      if (accountInfo.owner.equals(this.RAYDIUM_CLMM_PROGRAM)) {
        const data = accountInfo.data;
        const token0 = new PublicKey(data.slice(64, 96));
        const token1 = new PublicKey(data.slice(96, 128));
        
        return {
          type: 'raydium-clmm',
          token0: token0.toBase58(),
          token1: token1.toBase58()
        };
      }
      
      return null;
    } catch (error) {
      this.logger.error('Failed to get pool info', {
        pool: poolAddress.toBase58(),
        error
      });
      return null;
    }
  }
  
  /**
   * Check if a pool is a MIKO pool
   */
  async isMikoPool(poolAddress: PublicKey, mikoMint: PublicKey): Promise<boolean> {
    const poolInfo = await this.getPoolInfo(poolAddress);
    if (!poolInfo) {
      return false;
    }
    
    if (poolInfo.type === 'raydium-v2') {
      return poolInfo.baseMint === mikoMint.toBase58() || 
             poolInfo.quoteMint === mikoMint.toBase58();
    }
    
    if (poolInfo.type === 'raydium-cpmm' || poolInfo.type === 'raydium-clmm') {
      return poolInfo.token0 === mikoMint.toBase58() || 
             poolInfo.token1 === mikoMint.toBase58();
    }
    
    return false;
  }
  
  /**
   * Reset detected pools cache
   */
  resetCache() {
    this.detectedPools.clear();
    this.logger.info('Pool detection cache reset');
  }
  
  /**
   * Get all detected pools
   */
  getDetectedPools(): string[] {
    return Array.from(this.detectedPools);
  }
  
  /**
   * Initialize with existing pools from vault
   */
  initializeWithExistingPools(pools: PublicKey[]) {
    for (const pool of pools) {
      this.detectedPools.add(pool.toBase58());
    }
    this.logger.info('Initialized pool detector with existing pools', {
      count: pools.length
    });
  }
}