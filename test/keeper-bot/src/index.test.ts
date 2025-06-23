import { Connection, Keypair } from '@solana/web3.js';
import * as dotenv from 'dotenv';
import { logger } from '../../../keeper-bot/src/utils/logger';
import { AIMonitorServiceTest } from './services/AIMonitorService.test';
import { TaxCollectorServiceTest } from './services/TaxCollectorService.test';
import { RewardDistributorServiceTest } from './services/RewardDistributorService.test';
import { HealthMonitor } from '../../../keeper-bot/src/monitoring/HealthMonitor';
import { loadPrograms } from '../../../keeper-bot/src/utils/programLoader';

// Load test environment
dotenv.config({ path: '.env.test' });

async function main() {
  try {
    logger.info('===========================================');
    logger.info('Starting MIKO Keeper Bot in TEST MODE');
    logger.info('===========================================');
    logger.info('- No token swaps (distributing MIKO directly)');
    logger.info('- No price checks (using 100k MIKO threshold)');
    logger.info('- Mock tweets for reward selection');
    logger.info('- Simplified for devnet testing');
    logger.info('===========================================');
    
    // Initialize connection
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    
    // Load keeper wallet
    const keeperWallet = Keypair.fromSecretKey(
      Buffer.from(process.env.KEEPER_BOT_PRIVATE_KEY!, 'base64')
    );
    
    logger.info(`[TEST MODE] Keeper wallet: ${keeperWallet.publicKey.toBase58()}`);
    
    // Load programs
    const programs = await loadPrograms(connection, keeperWallet);
    
    // Initialize TEST services
    const aiMonitor = new AIMonitorServiceTest(programs.smartDial);
    const taxCollector = new TaxCollectorServiceTest(
      connection,
      keeperWallet,
      programs.absoluteVault
    );
    const rewardDistributor = new RewardDistributorServiceTest(
      connection,
      keeperWallet,
      programs.absoluteVault,
      programs.smartDial
    );
    
    // Start health monitoring
    const healthMonitor = new HealthMonitor();
    await healthMonitor.start();
    
    // Start services
    await aiMonitor.start();
    await taxCollector.startContinuousCollection();
    await rewardDistributor.startContinuousDistribution();
    
    logger.info('[TEST MODE] All services started successfully');
    logger.info('[TEST MODE] Monitor health at http://localhost:3000/health');
    
    // Keep process running
    process.on('SIGINT', async () => {
      logger.info('[TEST MODE] Shutting down...');
      await healthMonitor.stop();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('[TEST MODE] Fatal error:', error);
    process.exit(1);
  }
}

main();