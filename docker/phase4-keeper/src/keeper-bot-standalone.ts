import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { createLogger } from './utils/logger';
import { Phase4BConfigLoader, Phase4BConfig } from './config/config';
import { FeeUpdateManagerPhase4B } from './modules/fee-update-manager-phase4b';
import * as fs from 'fs';

const logger = createLogger('Phase4BKeeperBot');

export class Phase4BKeeperBot {
  private connection: Connection;
  private config: Phase4BConfig;
  private keeper: Keypair;
  private isRunning = false;
  
  private feeUpdateManager!: FeeUpdateManagerPhase4B;
  private feeUpdateInterval?: NodeJS.Timeout;
  private harvestInterval?: NodeJS.Timeout;

  constructor() {
    // Load configuration
    this.config = Phase4BConfigLoader.load();
    
    // Create connection
    this.connection = new Connection(this.config.network.rpc_url, {
      commitment: this.config.network.commitment as any,
    });
    
    // Load keeper keypair (using deployer)
    const deployerData = JSON.parse(fs.readFileSync('../phase4b-deployer.json', 'utf-8'));
    this.keeper = Keypair.fromSecretKey(new Uint8Array(deployerData));
    
    this.initializeModules();
  }

  private async initializeModules(): Promise<void> {
    logger.info('Initializing Phase 4-B keeper bot modules');
    
    // Load IDLs
    const vaultIdl = JSON.parse(fs.readFileSync('../phase4b-vault-idl.json', 'utf-8'));
    
    // Initialize fee update manager with real implementation
    this.feeUpdateManager = new FeeUpdateManagerPhase4B(
      this.connection,
      this.config as any, // Type compatibility
      new PublicKey(this.config.programs.vault_program_id),
      vaultIdl,
      new PublicKey(this.config.token.mint_address),
      new PublicKey(this.config.pdas.vault_pda),
      this.keeper
    );
    
    // Set launch timestamp if available
    if (this.config.pool?.launch_timestamp) {
      this.feeUpdateManager.setLaunchTimestamp(this.config.pool.launch_timestamp);
    }
    
    logger.info('All modules initialized successfully');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Keeper bot is already running');
      return;
    }

    try {
      logger.info('Starting Phase 4-B Keeper Bot');
      logger.info('Configuration:');
      logger.info(`- RPC: ${this.config.network.rpc_url}`);
      logger.info(`- Vault: ${this.config.programs.vault_program_id}`);
      logger.info(`- Token: ${this.config.token.mint_address}`);
      logger.info(`- Keeper: ${this.keeper.publicKey.toBase58()}`);
      
      if (this.config.pool?.pool_id) {
        logger.info(`- Pool: ${this.config.pool.pool_id}`);
      }
      
      // Schedule fee updates
      this.scheduleFeeUpdates();
      
      // Schedule harvest checks (placeholder for now)
      this.scheduleHarvestChecks();
      
      this.isRunning = true;
      logger.info('Keeper bot started successfully');
      
      // Initial status
      this.logStatus();
      
    } catch (error) {
      logger.error('Failed to start keeper bot', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Keeper bot is not running');
      return;
    }

    logger.info('Stopping keeper bot');
    
    // Clear intervals
    if (this.feeUpdateInterval) {
      clearInterval(this.feeUpdateInterval);
    }
    if (this.harvestInterval) {
      clearInterval(this.harvestInterval);
    }
    
    this.isRunning = false;
    logger.info('Keeper bot stopped');
  }

  private scheduleFeeUpdates(): void {
    const interval = this.config.timing.fee_update_check_interval * 1000; // Convert to ms
    
    // Initial check
    this.checkFeeUpdate();
    
    // Schedule recurring checks
    this.feeUpdateInterval = setInterval(async () => {
      await this.checkFeeUpdate();
    }, interval);
    
    logger.info(`Scheduled fee update checks every ${this.config.timing.fee_update_check_interval} seconds`);
  }

  private async checkFeeUpdate(): Promise<void> {
    try {
      const result = await this.feeUpdateManager.checkAndUpdateFee();
      if (result) {
        logger.info('Fee update executed:', result);
      }
    } catch (error) {
      logger.error('Fee update check failed', { error });
    }
  }

  private scheduleHarvestChecks(): void {
    const interval = this.config.timing.harvest_check_interval * 1000;
    
    this.harvestInterval = setInterval(async () => {
      await this.checkHarvest();
    }, interval);
    
    logger.info(`Scheduled harvest checks every ${this.config.timing.harvest_check_interval} seconds`);
  }

  private async checkHarvest(): Promise<void> {
    logger.debug('Harvest check - not implemented yet');
    // TODO: Implement harvest logic
  }

  private logStatus(): void {
    const feeStatus = this.feeUpdateManager.getStatus();
    
    logger.info('=== Keeper Bot Status ===');
    logger.info('Fee Manager:', JSON.stringify(feeStatus, null, 2));
    logger.info('========================');
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      config: {
        vault: this.config.programs.vault_program_id,
        token: this.config.token.mint_address,
        keeper: this.keeper.publicKey.toBase58(),
      },
      modules: {
        feeUpdate: this.feeUpdateManager.getStatus(),
      }
    };
  }

  async triggerFeeUpdateCheck(): Promise<void> {
    logger.info('Manually triggering fee update check');
    await this.checkFeeUpdate();
  }
}

// Main execution
async function main() {
  const bot = new Phase4BKeeperBot();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await bot.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await bot.stop();
    process.exit(0);
  });
  
  // Handle commands
  process.stdin.on('data', async (data) => {
    const input = data.toString().trim();
    
    if (input === 'status') {
      console.log(JSON.stringify(bot.getStatus(), null, 2));
    } else if (input === 'fee') {
      await bot.triggerFeeUpdateCheck();
    } else if (input === 'help') {
      console.log('Available commands:');
      console.log('  status - Show current bot status');
      console.log('  fee    - Manually trigger fee update check');
      console.log('  help   - Show this help message');
    }
  });
  
  // Start the bot
  await bot.start();
  
  logger.info('Keeper bot is running. Type "help" for available commands.');
  
  // Keep process alive
  process.stdin.resume();
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}