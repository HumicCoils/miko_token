import { PublicKey, Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
// import { fileURLToPath } from 'url';
// import { dirname } from 'path';
import { ConfigManager } from '../../config-manager';
import { createLogger } from '../utils/logger';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

export interface Phase4BConfig {
  network: {
    rpc_url: string;
    commitment: string;
  };
  programs: {
    vault_program_id: string;
    smart_dial_program_id: string;
    token_program_id: string;
  };
  token: {
    mint_address: string;
    decimals: number;
  };
  wallets: {
    keeper_pubkey: string;
    owner_wallet: string;
  };
  pdas: {
    vault_pda: string;
    smart_dial_pda: string;
  };
  harvest: {
    threshold_miko: number;
    batch_size: number;
  };
  timing: {
    fee_update_check_interval: number; // seconds
    harvest_check_interval: number; // seconds
    monday_check_time: string; // HH:MM:SS
  };
  pool?: {
    pool_id?: string;
    launch_timestamp?: number;
  };
}

export class Phase4BConfigLoader {
  private static config: Phase4BConfig | null = null;
  private static logger = createLogger('Phase4BConfigLoader');

  static async load(): Promise<Phase4BConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      // Use ConfigManager to get auto-derived configuration
      const configManager = new ConfigManager(path.join(process.cwd(), '../minimal-config.json'));
      const autoConfig = await configManager.getFullConfig();
      
      // Load keeper keypair info
      const keeperKeypairPath = path.join(process.cwd(), 'phase4b-keeper-keypair.json');
      const keeperKeypairData = JSON.parse(fs.readFileSync(keeperKeypairPath, 'utf-8'));
      const keeperKeypair = Keypair.fromSecretKey(new Uint8Array(keeperKeypairData));
      const keeperPubkey = keeperKeypair.publicKey;

      // Build config from auto-derived values
      const config: Phase4BConfig = {
        network: {
          rpc_url: autoConfig.network.rpc_url,
          commitment: 'confirmed',
        },
        programs: {
          vault_program_id: autoConfig.programs.vault_program_id,
          smart_dial_program_id: autoConfig.programs.smart_dial_program_id,
          token_program_id: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
        },
        token: {
          mint_address: autoConfig.token.mint_address,
          decimals: autoConfig.token.decimals,
        },
        wallets: {
          keeper_pubkey: keeperPubkey.toBase58(),
          owner_wallet: autoConfig.wallets.owner || '',
        },
        pdas: {
          vault_pda: autoConfig.pdas.vault_pda,
          smart_dial_pda: autoConfig.pdas.smart_dial_pda || '',
        },
        harvest: {
          threshold_miko: 500000, // 500k MIKO
          batch_size: 20,
        },
        timing: {
          fee_update_check_interval: 30, // 30 seconds for testing
          harvest_check_interval: 60, // 1 minute
          monday_check_time: '03:00:00',
        },
        pool: {
          pool_id: autoConfig.pool.pool_id,
          launch_timestamp: autoConfig.pool.launch_timestamp,
        },
      };

      // Validate config
      this.validateConfig(config);

      this.config = config;
      this.logger.info('Configuration loaded from auto-derived values');
      return config;
      
    } catch (error) {
      this.logger.error('Failed to load configuration', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined 
      });
      throw error;
    }
  }

  private static validateConfig(config: Phase4BConfig): void {
    // Validate public keys
    try {
      new PublicKey(config.programs.vault_program_id);
      new PublicKey(config.programs.smart_dial_program_id);
      new PublicKey(config.token.mint_address);
      new PublicKey(config.wallets.keeper_pubkey);
      if (config.wallets.owner_wallet) {
        new PublicKey(config.wallets.owner_wallet);
      }
      new PublicKey(config.pdas.vault_pda);
      if (config.pdas.smart_dial_pda) {
        new PublicKey(config.pdas.smart_dial_pda);
      }
      
      if (config.pool?.pool_id) {
        new PublicKey(config.pool.pool_id);
      }
    } catch (error) {
      throw new Error(`Invalid public key in config: ${error}`);
    }
  }

  static async get(): Promise<Phase4BConfig> {
    if (!this.config) {
      return await this.load();
    }
    return this.config;
  }
}