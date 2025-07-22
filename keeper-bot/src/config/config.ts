import { PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import * as TOML from '@iarna/toml';

export interface Config {
  network: {
    rpc_primary: string;
    rpc_backup: string;
    network_type: string;
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
    total_supply: number;
  };
  keeper: {
    wallet_pubkey: string;
    min_sol_balance: number;
    max_sol_balance: number;
  };
  harvest: {
    threshold_miko: number;
    batch_size: number;
    retry_attempts: number;
    retry_delay_ms: number;
  };
  adapters: {
    raydium: string;
    jupiter: string;
    birdeye: string;
  };
  test_data: {
    launch_timestamp: number;
    keeper_balance: number;
    mock_holder_count: number;
    mock_price_usd: number;
    mock_24h_volume: number;
  };
  apis: {
    twitter: {
      enabled: boolean;
      api_key: string;
      api_secret: string;
      access_token: string;
      access_secret: string;
      account_handle: string;
    };
    birdeye: {
      enabled: boolean;
      api_key: string;
      base_url: string;
    };
    jupiter: {
      enabled: boolean;
      base_url: string;
      slippage_bps: number;
    };
  };
  timing: {
    fee_update_5min: number;
    fee_update_10min: number;
    harvest_check_interval: number;
    monday_check_time: string;
  };
  logging: {
    level: string;
    file: string;
    max_size_mb: number;
    max_files: number;
  };
}

export class ConfigLoader {
  private static instance: Config | null = null;

  static load(configPath?: string): Config {
    if (this.instance) {
      return this.instance;
    }

    const defaultPath = path.join(process.cwd(), 'config', 'mock_config.toml');
    const finalPath = configPath || process.env.CONFIG_PATH || defaultPath;

    if (!fs.existsSync(finalPath)) {
      throw new Error(`Config file not found at: ${finalPath}`);
    }

    const configContent = fs.readFileSync(finalPath, 'utf-8');
    const config = TOML.parse(configContent) as unknown as Config;

    // Validate required fields
    this.validateConfig(config);

    this.instance = config;
    return config;
  }

  private static validateConfig(config: Config): void {
    // Validate program IDs
    if (!config.programs.vault_program_id || !config.programs.smart_dial_program_id) {
      throw new Error('Program IDs are required in config');
    }

    // Validate token info
    if (!config.token.mint_address || config.token.decimals === undefined) {
      throw new Error('Token information is required in config');
    }

    // Validate keeper wallet
    if (!config.keeper.wallet_pubkey) {
      throw new Error('Keeper wallet public key is required');
    }

    // Validate timing
    if (!config.timing.fee_update_5min || !config.timing.fee_update_10min) {
      throw new Error('Fee update timings are required');
    }

    // Try to parse public keys
    try {
      new PublicKey(config.programs.vault_program_id);
      new PublicKey(config.programs.smart_dial_program_id);
      new PublicKey(config.token.mint_address);
      new PublicKey(config.keeper.wallet_pubkey);
    } catch (error) {
      throw new Error(`Invalid public key in config: ${error}`);
    }
  }

  static reload(configPath?: string): Config {
    this.instance = null;
    return this.load(configPath);
  }

  static get(): Config {
    if (!this.instance) {
      throw new Error('Config not loaded. Call ConfigLoader.load() first');
    }
    return this.instance;
  }
}