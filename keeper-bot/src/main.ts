import { Connection, Keypair } from '@solana/web3.js';
import { Program } from '@project-serum/anchor';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { AIAgentMonitor } from './services/AIAgentMonitor';
import { TaxSwapDistributor } from './services/TaxSwapDistributor';
import { HolderRegistryService } from './services/HolderRegistryService';
import { SmartDialService } from './services/SmartDialService';
import { WalletExclusionService } from './services/WalletExclusionService';
import { BirdeyeClient } from './clients/BirdeyeClient';
import { JupiterClient } from './clients/JupiterClient';
import { HealthMonitor } from './monitoring/HealthMonitor';
import { loadPrograms } from './utils/programLoader';

async function main() {
  try {
    logger.info('Starting MIKO Token Keeper Bot...');
    
    // Validate configuration
    validateConfig();
    
    // Initialize connection
    const connection = new Connection(config.SOLANA_RPC_URL, {
      commitment: config.COMMITMENT_LEVEL,
      wsEndpoint: config.SOLANA_WS_URL,
    });
    
    // Load keeper wallet
    const keeperWallet = Keypair.fromSecretKey(
      Buffer.from(config.KEEPER_BOT_PRIVATE_KEY, 'base64')
    );
    logger.info(`Keeper bot wallet: ${keeperWallet.publicKey.toBase58()}`);
    
    // Load programs
    const { absoluteVault, smartDial } = await loadPrograms(connection, keeperWallet);
    
    // Initialize clients
    const birdeyeClient = new BirdeyeClient();
    const jupiterClient = new JupiterClient(connection);
    
    // Initialize services
    const smartDialService = new SmartDialService(connection, keeperWallet, smartDial);
    const holderRegistryService = new HolderRegistryService(
      connection,
      keeperWallet,
      absoluteVault,
      birdeyeClient
    );
    
    const aiAgentMonitor = new AIAgentMonitor(birdeyeClient, smartDialService);
    const taxSwapDistributor = new TaxSwapDistributor(
      connection,
      keeperWallet,
      absoluteVault,
      jupiterClient,
      smartDialService,
      holderRegistryService
    );
    
    const walletExclusionService = new WalletExclusionService(
      connection,
      keeperWallet,
      absoluteVault
    );
    
    // Initialize health monitoring
    const healthMonitor = new HealthMonitor(config.HEALTH_CHECK_PORT);
    await healthMonitor.start();
    
    // Initialize default exclusions
    logger.info('Initializing default wallet exclusions...');
    await walletExclusionService.initializeDefaultExclusions();
    
    // Start services
    logger.info('Starting AI agent monitor...');
    await aiAgentMonitor.startMonitoring();
    
    logger.info('Starting continuous tax swap and distribution...');
    await taxSwapDistributor.startContinuousDistribution();
    
    logger.info('MIKO Token Keeper Bot is running!');
    logger.info('- AI Agent monitoring: Every Monday at 03:00 UTC');
    logger.info('- Tax distribution: Every 5 minutes');
    logger.info(`- Health check: http://localhost:${config.HEALTH_CHECK_PORT}/health`);
    
    // Keep the process running
    process.on('SIGINT', async () => {
      logger.info('Shutting down keeper bot...');
      await healthMonitor.stop();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Fatal error starting keeper bot:', error);
    process.exit(1);
  }
}

// Run the keeper bot
main();