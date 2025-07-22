import { KeeperBot } from '../src/KeeperBot';
import { createLogger } from '../src/utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('PreflightTest');

async function testPreflight() {
  logger.info('Starting VC:4.KEEPER_PREFLIGHT test...');
  
  try {
    // Create keeper bot instance
    const bot = new KeeperBot();
    
    // The bot constructor and start method will perform preflight checks
    // This will generate the vc4-keeper-preflight.json artifact
    await bot.start();
    
    logger.info('Keeper bot started successfully');
    logger.info('Preflight checks passed');
    
    // Stop the bot
    await bot.stop();
    
    // Copy artifact to shared location
    const artifactPath = path.join(process.cwd(), 'verification', 'vc4-keeper-preflight.json');
    const targetPath = path.join('/shared-artifacts', 'verification', 'vc4-keeper-preflight.json');
    
    if (fs.existsSync(artifactPath)) {
      fs.copyFileSync(artifactPath, targetPath);
      logger.info('Verification artifact copied to shared-artifacts');
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Preflight test failed', { error });
    process.exit(1);
  }
}

// Run the test
testPreflight();