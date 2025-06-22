import * as dotenv from 'dotenv';
import { PublicKey } from '@solana/web3.js';

// Load environment variables
dotenv.config();

interface Config {
  // Solana Configuration
  SOLANA_RPC_URL: string;
  SOLANA_WS_URL: string;
  COMMITMENT_LEVEL: 'processed' | 'confirmed' | 'finalized';
  
  // Program IDs
  ABSOLUTE_VAULT_PROGRAM: string;
  SMART_DIAL_PROGRAM: string;
  MIKO_TRANSFER_PROGRAM: string;
  
  // Token Configuration
  MIKO_TOKEN_MINT: string;
  TREASURY_WALLET: string;
  OWNER_WALLET: string;
  
  // Keeper Bot Configuration
  KEEPER_BOT_PRIVATE_KEY: string;
  MIN_TAX_FOR_DISTRIBUTION: number;
  HOLDER_VALUE_THRESHOLD: number;
  
  // External APIs
  TWITTER_BEARER_TOKEN: string;
  BIRDEYE_API_KEY: string;
  
  // Monitoring
  HEALTH_CHECK_PORT: number;
  METRICS_PORT: number;
  LOG_LEVEL: string;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value) {
    return parseInt(value, 10);
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Missing required environment variable: ${key}`);
}

export const config: Config = {
  // Solana Configuration
  SOLANA_RPC_URL: getEnvVar('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),
  SOLANA_WS_URL: getEnvVar('SOLANA_WS_URL', 'wss://api.mainnet-beta.solana.com'),
  COMMITMENT_LEVEL: 'confirmed',
  
  // Program IDs
  ABSOLUTE_VAULT_PROGRAM: getEnvVar('ABSOLUTE_VAULT_PROGRAM'),
  SMART_DIAL_PROGRAM: getEnvVar('SMART_DIAL_PROGRAM'),
  MIKO_TRANSFER_PROGRAM: getEnvVar('MIKO_TRANSFER_PROGRAM'),
  
  // Token Configuration
  MIKO_TOKEN_MINT: getEnvVar('MIKO_TOKEN_MINT'),
  TREASURY_WALLET: getEnvVar('TREASURY_WALLET'),
  OWNER_WALLET: getEnvVar('OWNER_WALLET'),
  
  // Keeper Bot Configuration
  KEEPER_BOT_PRIVATE_KEY: getEnvVar('KEEPER_BOT_PRIVATE_KEY'),
  MIN_TAX_FOR_DISTRIBUTION: getEnvNumber('MIN_TAX_FOR_DISTRIBUTION', 1000), // 1,000 MIKO minimum
  HOLDER_VALUE_THRESHOLD: getEnvNumber('HOLDER_VALUE_THRESHOLD', 100), // $100 USD
  
  // External APIs
  TWITTER_BEARER_TOKEN: getEnvVar('TWITTER_BEARER_TOKEN'),
  BIRDEYE_API_KEY: getEnvVar('BIRDEYE_API_KEY'),
  
  // Monitoring
  HEALTH_CHECK_PORT: getEnvNumber('HEALTH_CHECK_PORT', 3000),
  METRICS_PORT: getEnvNumber('METRICS_PORT', 3001),
  LOG_LEVEL: getEnvVar('LOG_LEVEL', 'info'),
};

// Validate configuration
export function validateConfig(): void {
  // Validate program IDs are valid public keys
  try {
    new PublicKey(config.ABSOLUTE_VAULT_PROGRAM);
    new PublicKey(config.SMART_DIAL_PROGRAM);
    new PublicKey(config.MIKO_TRANSFER_PROGRAM);
    new PublicKey(config.MIKO_TOKEN_MINT);
    new PublicKey(config.TREASURY_WALLET);
    new PublicKey(config.OWNER_WALLET);
  } catch (error) {
    throw new Error(`Invalid public key in configuration: ${error}`);
  }
  
  // Validate keeper bot private key is base64
  try {
    const keyData = Buffer.from(config.KEEPER_BOT_PRIVATE_KEY, 'base64');
    if (keyData.length !== 64) {
      throw new Error('Keeper bot private key must be 64 bytes');
    }
  } catch (error) {
    throw new Error(`Invalid keeper bot private key: ${error}`);
  }
}