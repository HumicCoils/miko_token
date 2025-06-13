import dotenv from 'dotenv';
import { PublicKey } from '@solana/web3.js';

// Load environment variables
dotenv.config();

export interface Config {
    // API Keys
    BIRDEYE_API_KEY: string;
    TWITTER_BEARER_TOKEN: string;
    
    // Solana
    RPC_URL: string;
    KEEPER_BOT_KEY: string;
    
    // Program IDs
    ABSOLUTE_VAULT_PROGRAM_ID: PublicKey;
    SMART_DIAL_PROGRAM_ID: PublicKey;
    MIKO_TOKEN_MINT: PublicKey;
    
    // Wallets
    EMERGENCY_FUND_ADDRESS: PublicKey;
    
    // AI Agent
    AI_AGENT_TWITTER_ID: string;
    AI_AGENT_USERNAME: string;
    
    // Scheduling
    REWARD_CHECK_INTERVAL_MS: number;
    REWARD_DISTRIBUTION_INTERVAL_MS: number;
    HOLDER_UPDATE_INTERVAL_MS: number;
    
    // Monitoring
    HEALTH_CHECK_PORT: number;
    METRICS_PORT: number;
    
    // Notifications
    DISCORD_WEBHOOK_URL?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
    
    // Environment
    NODE_ENV: string;
    LOG_LEVEL: string;
}

function validateEnvVar(name: string, value: string | undefined): string {
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function validatePublicKey(name: string, value: string | undefined): PublicKey {
    const keyString = validateEnvVar(name, value);
    try {
        return new PublicKey(keyString);
    } catch (error) {
        throw new Error(`Invalid public key for ${name}: ${keyString}`);
    }
}

export const config: Config = {
    // API Keys
    BIRDEYE_API_KEY: validateEnvVar('BIRDEYE_API_KEY', process.env.BIRDEYE_API_KEY),
    TWITTER_BEARER_TOKEN: validateEnvVar('TWITTER_BEARER_TOKEN', process.env.TWITTER_BEARER_TOKEN),
    
    // Solana
    RPC_URL: process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
    KEEPER_BOT_KEY: validateEnvVar('KEEPER_BOT_KEY', process.env.KEEPER_BOT_KEY),
    
    // Program IDs
    ABSOLUTE_VAULT_PROGRAM_ID: validatePublicKey('ABSOLUTE_VAULT_PROGRAM_ID', process.env.ABSOLUTE_VAULT_PROGRAM_ID),
    SMART_DIAL_PROGRAM_ID: validatePublicKey('SMART_DIAL_PROGRAM_ID', process.env.SMART_DIAL_PROGRAM_ID),
    MIKO_TOKEN_MINT: validatePublicKey('MIKO_TOKEN_MINT', process.env.MIKO_TOKEN_MINT),
    
    // Wallets
    EMERGENCY_FUND_ADDRESS: validatePublicKey('EMERGENCY_FUND_ADDRESS', process.env.EMERGENCY_FUND_ADDRESS || 'FwN6tCpJkHhuYxBKwcrGU6PDW4aRNuukQBi58ay4iYGM'),
    
    // AI Agent
    AI_AGENT_TWITTER_ID: "1807336107638001665",
    AI_AGENT_USERNAME: "mikolovescrypto",
    
    // Scheduling (in milliseconds)
    REWARD_CHECK_INTERVAL_MS: parseInt(process.env.REWARD_CHECK_INTERVAL_MS || "1800000"), // 30 minutes
    REWARD_DISTRIBUTION_INTERVAL_MS: parseInt(process.env.REWARD_DISTRIBUTION_INTERVAL_MS || "300000"), // 5 minutes
    HOLDER_UPDATE_INTERVAL_MS: parseInt(process.env.HOLDER_UPDATE_INTERVAL_MS || "3600000"), // 1 hour
    
    // Monitoring
    HEALTH_CHECK_PORT: parseInt(process.env.HEALTH_CHECK_PORT || "3000"),
    METRICS_PORT: parseInt(process.env.METRICS_PORT || "9090"),
    
    // Notifications (optional)
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    
    // Environment
    NODE_ENV: process.env.NODE_ENV || "development",
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
};

// Validate configuration on startup
export function validateConfig(): void {
    const requiredVars = [
        'BIRDEYE_API_KEY',
        'TWITTER_BEARER_TOKEN',
        'KEEPER_BOT_KEY',
        'ABSOLUTE_VAULT_PROGRAM_ID',
        'SMART_DIAL_PROGRAM_ID',
        'MIKO_TOKEN_MINT'
    ];
    
    const missing = requiredVars.filter(varName => {
        try {
            const value = (config as any)[varName];
            return !value;
        } catch {
            return true;
        }
    });
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    // Validate keeper bot key format
    try {
        const keyBytes = Buffer.from(config.KEEPER_BOT_KEY, 'base64');
        if (keyBytes.length !== 64) {
            throw new Error('Invalid key length');
        }
    } catch (error) {
        throw new Error('KEEPER_BOT_KEY must be a valid base64-encoded private key');
    }
}