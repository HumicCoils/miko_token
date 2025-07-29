import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { createLogger } from '../utils/logger';
import { Phase4BConfig } from '../config/config';

const logger = createLogger('DynamicExclusionManager');

// Raydium CPMM pool vault seed
const POOL_VAULT_SEED_PREFIX = Buffer.from('pool_vault');

export class DynamicExclusionManager {
  private connection: Connection;
  private config: Phase4BConfig;
  private vaultProgram: any; // Will be passed from keeper bot
  private knownPools: Set<string> = new Set();
  private knownRouters: Set<string> = new Set([
    // Jupiter V6 Program
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    // Raydium CPMM Program
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
  ]);

  constructor(connection: Connection, config: Phase4BConfig, vaultProgram: any) {
    this.connection = connection;
    this.config = config;
    this.vaultProgram = vaultProgram;
  }

  /**
   * Detect liquidity pools holding MIKO tokens
   * Called before distributions to ensure pools are excluded
   */
  async detectMikoPools(): Promise<PublicKey[]> {
    try {
      const mintPubkey = new PublicKey(this.config.token.mint_address);
      
      // Get current exclusions from vault
      const vaultAccount = await this.vaultProgram.account.vault.fetch(
        new PublicKey(this.config.pdas.vault_pda)
      );
      
      const currentExclusions = new Set<string>(
        vaultAccount.rewardExclusions.map((pk: PublicKey) => pk.toBase58())
      );
      
      const newPools: PublicKey[] = [];
      
      // Check if we have a pool configured
      if (this.config.pool?.pool_id) {
        // Get pool vault account for our CPMM pool
        const poolId = new PublicKey(this.config.pool.pool_id);
        const [poolVault] = PublicKey.findProgramAddressSync(
          [POOL_VAULT_SEED_PREFIX, poolId.toBuffer()],
          new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C')
        );
        
        // Check if already excluded
        if (!currentExclusions.has(poolVault.toBase58())) {
          // Verify it holds MIKO
          try {
            const vaultTokenAccount = await this.connection.getParsedTokenAccountsByOwner(
              poolVault,
              { mint: mintPubkey },
              'confirmed'
            );
            
            if (vaultTokenAccount.value.length > 0) {
              const balance = Number(vaultTokenAccount.value[0].account.data.parsed.info.tokenAmount.amount);
              if (balance > 0) {
                newPools.push(poolVault);
                this.knownPools.add(poolVault.toBase58());
                logger.info(`Found pool vault ${poolVault.toBase58()} with ${balance / 1e9} MIKO to exclude`);
              }
            }
          } catch (e) {
            logger.debug('Could not check pool vault balance');
          }
        } else {
          logger.debug(`Pool vault ${poolVault.toBase58()} already excluded`);
        }
      }
      
      // In production, would scan for all pools via indexer
      // For Phase 4B, we only need to handle our own pool
      return newPools;
      
    } catch (error) {
      logger.error('Failed to detect MIKO pools', { error });
      return [];
    }
  }

  /**
   * Add detected pools to vault exclusions
   * Adds to both fee and reward exclusions
   */
  async addPoolsToExclusions(pools: PublicKey[]): Promise<string[]> {
    const signatures: string[] = [];
    
    for (const pool of pools) {
      try {
        // Add to fee exclusions (prevent pools from being taxed)
        const tx = await this.vaultProgram.methods
          .manageExclusions(
            { add: {} }, // ExclusionAction::Add
            { fee: {} }, // ExclusionListType::Fee
            pool
          )
          .accounts({
            vault: new PublicKey(this.config.pdas.vault_pda),
            authority: this.vaultProgram.provider.publicKey,
          })
          .rpc();
        
        signatures.push(tx);
        logger.info(`Added pool ${pool.toBase58()} to fee exclusions, tx: ${tx}`);
        
        // Add to reward exclusions (prevent pools from receiving distributions)
        const tx2 = await this.vaultProgram.methods
          .manageExclusions(
            { add: {} },
            { reward: {} }, // ExclusionListType::Reward
            pool
          )
          .accounts({
            vault: new PublicKey(this.config.pdas.vault_pda),
            authority: this.vaultProgram.provider.publicKey,
          })
          .rpc();
        
        signatures.push(tx2);
        logger.info(`Added pool ${pool.toBase58()} to reward exclusions, tx: ${tx2}`);
        
      } catch (error) {
        logger.error(`Failed to add pool ${pool.toBase58()} to exclusions`, { error });
      }
    }
    
    return signatures;
  }

  /**
   * Get temporary swap accounts that need fee exemption during Jupiter swaps
   * Note: These are router programs, not individual swap accounts
   */
  getJupiterSwapExemptions(): PublicKey[] {
    // These are typically intermediate accounts used during swaps
    // In production, these would be dynamically determined from Jupiter route
    return [
      new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'), // Jupiter V6
      new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'), // Raydium CPMM
    ];
  }

  /**
   * Check if an account should be excluded from fees/rewards
   */
  async isExcluded(account: PublicKey, listType: 'fee' | 'reward'): Promise<boolean> {
    try {
      const vaultAccount = await this.vaultProgram.account.vault.fetch(
        new PublicKey(this.config.pdas.vault_pda)
      );
      
      const exclusionList = listType === 'fee' 
        ? vaultAccount.feeExclusions 
        : vaultAccount.rewardExclusions;
      
      return exclusionList.some((excluded: PublicKey) => 
        excluded.equals(account)
      );
    } catch (error) {
      logger.error('Failed to check exclusion status', { error });
      return false;
    }
  }

  /**
   * Check for new pools before distribution
   * This is more efficient than scheduled checks
   */
  async updateExclusionsBeforeDistribution(): Promise<void> {
    logger.info('Checking for new pools before distribution...');
    
    const newPools = await this.detectMikoPools();
    if (newPools.length > 0) {
      logger.info(`Found ${newPools.length} new pools to exclude`);
      await this.addPoolsToExclusions(newPools);
    } else {
      logger.debug('No new pools detected');
    }
  }

  getStatus(): any {
    return {
      knownPools: Array.from(this.knownPools),
      knownRouters: Array.from(this.knownRouters),
      poolCount: this.knownPools.size,
    };
  }
}