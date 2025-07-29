import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import * as fs from 'fs';

// Minimal config - only what can't be derived
export interface MinimalConfig {
  rpc_url: string;
  vault_program_id: string;
  smart_dial_program_id: string;
  token_mint: string;
  keeper_keypair_path: string;
}

export class ConfigManager {
  private connection: Connection;
  private config: MinimalConfig;
  
  constructor(configPath: string = './minimal-config.json') {
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    this.connection = new Connection(this.config.rpc_url, 'confirmed');
  }
  
  // Auto-derive vault PDA
  getVaultPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), new PublicKey(this.config.token_mint).toBuffer()],
      new PublicKey(this.config.vault_program_id)
    );
    return pda;
  }
  
  // Auto-derive smart dial PDA
  getSmartDialPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('dial_state')],
      new PublicKey(this.config.smart_dial_program_id)
    );
    return pda;
  }
  
  // Find pool by querying on-chain
  async findPool(): Promise<PublicKey | null> {
    try {
      // For local fork testing, check if pool exists from launch execution
      if (this.config.rpc_url.includes('127.0.0.1')) {
        // Try to read from launch execution log first
        if (fs.existsSync('./launch-execution.log')) {
          const launchLog = fs.readFileSync('./launch-execution.log', 'utf-8');
          const poolMatch = launchLog.match(/Pool created: ([A-Za-z0-9]+)/);
          if (poolMatch) {
            return new PublicKey(poolMatch[1]);
          }
        }
        // Fallback to known pool if exists
        const knownPool = new PublicKey('Ato64e2AkmeoUTv93nCbcKJtmZkypZ9xesBpwbCyvUp7');
        const poolAccount = await this.connection.getAccountInfo(knownPool);
        if (poolAccount) {
          return knownPool;
        }
      }
      // In production, would query Raydium API
      return null;
    } catch (error) {
      console.error('Failed to find pool:', error);
      return null;
    }
  }
  
  // Get vault state from chain
  async getVaultState(): Promise<any> {
    const vaultPda = this.getVaultPda();
    const accountInfo = await this.connection.getAccountInfo(vaultPda);
    if (!accountInfo) return null;
    
    // Parse vault account data
    // Anchor accounts have 8-byte discriminator at the beginning
    const data = accountInfo.data;
    let offset = 8; // Skip discriminator
    
    // Parse fields in order
    const authority = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    const owner_wallet = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    const token_mint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    const min_hold_amount = data.readBigUInt64LE(offset);
    offset += 8;
    
    // Skip fee_exclusions vector (4 bytes length + n * 32 bytes)
    const fee_exclusions_len = data.readUInt32LE(offset);
    offset += 4 + (fee_exclusions_len * 32);
    
    // Skip reward_exclusions vector
    const reward_exclusions_len = data.readUInt32LE(offset);
    offset += 4 + (reward_exclusions_len * 32);
    
    const keeper_authority = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    const launch_timestamp = Number(data.readBigInt64LE(offset));
    offset += 8;
    
    return {
      authority,
      owner_wallet,
      token_mint,
      keeper_authority,
      launch_timestamp,
    };
  }
  
  // Get all config dynamically
  async getFullConfig() {
    const vaultPda = this.getVaultPda();
    const smartDialPda = this.getSmartDialPda();
    const poolId = await this.findPool();
    const vaultState = await this.getVaultState();
    
    return {
      network: {
        rpc_url: this.config.rpc_url
      },
      programs: {
        vault_program_id: this.config.vault_program_id,
        smart_dial_program_id: this.config.smart_dial_program_id
      },
      token: {
        mint_address: this.config.token_mint,
        decimals: 9
      },
      pdas: {
        vault_pda: vaultPda.toBase58(),
        smart_dial_pda: smartDialPda.toBase58()
      },
      pool: {
        pool_id: poolId?.toBase58(),
        launch_timestamp: vaultState?.launch_timestamp
      },
      wallets: {
        owner: vaultState?.owner_wallet?.toBase58(),
        keeper: vaultState?.keeper_authority?.toBase58()
      },
      keeper_keypair: this.config.keeper_keypair_path
    };
  }
}

// Export types for use in other modules
export type DerivedConfig = Awaited<ReturnType<ConfigManager['getFullConfig']>>;