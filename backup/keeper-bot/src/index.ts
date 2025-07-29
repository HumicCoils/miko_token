import { KeeperBot } from './KeeperBot';
import { createLogger } from './utils/logger';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = createLogger('Main');

async function main() {
  logger.info('MIKO Keeper Bot starting...');

  const bot = new KeeperBot();

  // Handle shutdown gracefully
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

  try {
    await bot.start();
    logger.info('Keeper bot is running. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error('Failed to start keeper bot', { error });
    process.exit(1);
  }
}

// Run the bot
main().catch(error => {
  logger.error('Unhandled error in main', { error });
  process.exit(1);
});