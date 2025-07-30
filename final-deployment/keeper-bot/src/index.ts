import { KeeperBot } from './keeper-bot';
import { Logger } from './utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = new Logger('Main');

/**
 * Main entry point for the keeper bot
 */
async function main() {
  logger.info('Starting MIKO Keeper Bot...');
  
  // Load config
  const configPath = path.join(__dirname, '..', 'config', 'config.json');
  if (!fs.existsSync(configPath)) {
    logger.error('Configuration file not found at:', configPath);
    process.exit(1);
  }
  
  // Check environment
  const network = process.env.NETWORK || 'localnet';
  const isDryRun = process.env.DRY_RUN === 'true';
  
  logger.info('Configuration:', {
    network,
    isDryRun,
    configPath
  });
  
  // Validate Birdeye API key for mainnet
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (network === 'mainnet' && !config.birdeye.api_key) {
    logger.error('Birdeye API key is required for mainnet operation');
    logger.error('Please set birdeye.api_key in config.json');
    process.exit(1);
  }
  
  // Create and start keeper bot
  const bot = new KeeperBot();
  
  // Set up signal handlers
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await bot.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await bot.stop();
    process.exit(0);
  });
  
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
  });
  
  process.on('unhandledRejection', (error) => {
    logger.error('Unhandled rejection:', error);
    process.exit(1);
  });
  
  // Start the bot
  try {
    await bot.start();
  } catch (error) {
    logger.error('Failed to start keeper bot:', error);
    process.exit(1);
  }
}

// Run main function
main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});