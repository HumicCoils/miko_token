import { Connection, Keypair } from '@solana/web3.js';
import * as dotenv from 'dotenv';
import { logger } from './utils/logger';
import { AIMonitorService } from './services/AIMonitorService';
import { TaxCollectorService } from './services/TaxCollectorService';
import { RewardDistributorService } from './services/RewardDistributorService';
import { HealthMonitor } from './monitoring/HealthMonitor';
import { loadPrograms } from './utils/programLoader';

dotenv.config();

async function main() {
  try {
    logger.info('Starting MIKO Keeper Bot...');
    
    // Initialize connection
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
    
    // Load keeper wallet
    const keeperWallet = Keypair.fromSecretKey(
      Buffer.from(process.env.KEEPER_BOT_PRIVATE_KEY!, 'base64')
    );
    
    logger.info(`Keeper wallet: ${keeperWallet.publicKey.toBase58()}`);
    
    // Load programs
    const programs = await loadPrograms(connection, keeperWallet);
    
    // Initialize services
    const aiMonitor = new AIMonitorService(programs.smartDial);
    const taxCollector = new TaxCollectorService(
      connection,
      keeperWallet,
      programs.absoluteVault
    );
    const rewardDistributor = new RewardDistributorService(
      connection,
      keeperWallet,
      programs.absoluteVault,
      programs.smartDial
    );
    
    // Start health monitoring
    const healthMonitor = new HealthMonitor();
    await healthMonitor.start();
    
    // Start AI monitoring (checks Monday 03:00 UTC)
    await aiMonitor.start();
    
    // Start continuous tax collection and distribution (every 5 minutes)
    await taxCollector.startContinuousCollection();
    await rewardDistributor.startContinuousDistribution();
    
    logger.info('MIKO Keeper Bot is running!');
    logger.info('- AI monitoring: Mondays at 03:00 UTC');
    logger.info('- Tax collection & distribution: Every 5 minutes');
    
    // Keep process running
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      await healthMonitor.stop();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

main();