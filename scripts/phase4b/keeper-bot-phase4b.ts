import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { KeeperBot } from '../../keeper-bot/src/KeeperBot';
import * as fs from 'fs';
import { createLogger } from '../../keeper-bot/src/utils/logger';

const logger = createLogger('Phase4BKeeperBot');

// Load Phase 4-B configurations
const phase4bConfig = JSON.parse(fs.readFileSync('phase4b-config.json', 'utf-8'));
const phase4bInitInfo = JSON.parse(fs.readFileSync('phase4b-init-info.json', 'utf-8'));
const phase4bVaultIdl = JSON.parse(fs.readFileSync('phase4b-vault-idl.json', 'utf-8'));
const phase4bSmartDialIdl = JSON.parse(fs.readFileSync('phase4b-smart-dial-idl.json', 'utf-8'));

// Phase 4-B specific configuration
const PHASE4B_CONFIG = {
  // Connection
  rpcUrl: 'http://127.0.0.1:8899',
  commitment: 'confirmed' as const,
  
  // Programs
  programs: {
    vault: {
      id: phase4bConfig.programs.vault,
      pda: phase4bInitInfo.vault.pda,
      idl: phase4bVaultIdl,
    },
    smartDial: {
      id: phase4bConfig.programs.smartDial,
      pda: phase4bInitInfo.smartDial.pda,
      idl: phase4bSmartDialIdl,
    },
  },
  
  // Token
  mikoToken: {
    mint: phase4bConfig.mikoToken,
    decimals: 9,
    program: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022
  },
  
  // Wallets
  wallets: {
    deployer: phase4bConfig.deployer,
    authority: phase4bInitInfo.vault.authority,
    treasury: phase4bInitInfo.vault.treasury,
    ownerWallet: phase4bInitInfo.vault.ownerWallet,
    keeperAuthority: phase4bInitInfo.vault.keeperAuthority,
  },
  
  // External programs (from mainnet fork)
  external: {
    raydiumClmm: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    jupiterV6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    pythOracle: 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG',
  },
  
  // Bot settings
  bot: {
    harvestBatchSize: 20,
    distributionMinAmount: 100_000_000_000, // 100 MIKO
    swapSlippage: 0.01, // 1%
    checkInterval: 30000, // 30 seconds
  },
};

async function startPhase4BKeeperBot() {
  logger.info('Starting Phase 4-B Keeper Bot...');
  
  try {
    // Load keeper configuration if exists (set by launch coordinator)
    let keeperConfig: any = {};
    if (fs.existsSync('phase4b-keeper-config.json')) {
      keeperConfig = JSON.parse(fs.readFileSync('phase4b-keeper-config.json', 'utf-8'));
      logger.info('Loaded keeper config from launch coordinator');
    }
    
    // Create connection
    const connection = new Connection(PHASE4B_CONFIG.rpcUrl, PHASE4B_CONFIG.commitment);
    
    // Load deployer keypair (acts as keeper for Phase 4-B)
    const deployerData = JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8'));
    const keeper = Keypair.fromSecretKey(new Uint8Array(deployerData));
    
    logger.info('Phase 4-B Configuration:');
    logger.info(`- Fork URL: ${PHASE4B_CONFIG.rpcUrl}`);
    logger.info(`- Vault Program: ${PHASE4B_CONFIG.programs.vault.id}`);
    logger.info(`- Smart Dial: ${PHASE4B_CONFIG.programs.smartDial.id}`);
    logger.info(`- MIKO Token: ${PHASE4B_CONFIG.mikoToken.mint}`);
    logger.info(`- Keeper: ${keeper.publicKey.toBase58()}`);
    
    if (keeperConfig.poolId) {
      logger.info(`- Pool ID: ${keeperConfig.poolId}`);
    }
    
    // Initialize keeper bot with Phase 4-B configuration
    const bot = new KeeperBot({
      connection,
      keeper,
      config: PHASE4B_CONFIG,
      poolId: keeperConfig.poolId ? new PublicKey(keeperConfig.poolId) : undefined,
      launchTimestamp: keeperConfig.launchTimestamp,
    });
    
    // Start the bot
    await bot.start();
    
    logger.info('Phase 4-B Keeper Bot is running!');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down keeper bot...');
      await bot.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('Shutting down keeper bot...');
      await bot.stop();
      process.exit(0);
    });
    
    // Keep process alive
    process.stdin.resume();
    
  } catch (error) {
    logger.error('Failed to start keeper bot:', error);
    process.exit(1);
  }
}

// Start the bot
startPhase4BKeeperBot();