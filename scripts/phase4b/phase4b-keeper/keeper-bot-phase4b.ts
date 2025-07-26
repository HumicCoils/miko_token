import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import { createLogger } from './utils/logger';
import { Phase4BConfigLoader, Phase4BConfig } from './config/config';
import { FeeUpdateManagerPhase4B } from './modules/fee-update-manager-phase4b';
import { FeeHarvester } from './modules/FeeHarvester';
import { SwapManager } from './modules/SwapManager';
import { DistributionEngine } from './modules/DistributionEngine';
import { TwitterMonitor } from './modules/TwitterMonitor';
import { TokenSelector } from './modules/TokenSelector';

const logger = createLogger('Phase4BKeeperBot');

class Phase4BKeeperBot {
  private connection!: Connection;
  private config!: Phase4BConfig;
  private keeper!: Keypair;
  private vaultIdl: any;
  private smartDialIdl: any;
  private isRunning = false;
  
  // Modules
  private feeUpdateManager!: FeeUpdateManagerPhase4B;
  private feeHarvester!: FeeHarvester;
  private swapManager!: SwapManager;
  private distributionEngine!: DistributionEngine;
  private twitterMonitor!: TwitterMonitor;
  private tokenSelector!: TokenSelector;
  
  // Intervals
  private feeUpdateInterval?: NodeJS.Timeout;
  private harvestInterval?: NodeJS.Timeout;
  private mondayCheckInterval?: NodeJS.Timeout;

  constructor() {
    // Configuration will be loaded asynchronously in init method
  }
  
  async init(): Promise<void> {
    // Load configuration asynchronously
    this.config = await Phase4BConfigLoader.load();
    
    // Create connection
    this.connection = new Connection(this.config.network.rpc_url, {
      commitment: this.config.network.commitment as any,
    });
    
    // Load keeper keypair
    const keeperData = JSON.parse(fs.readFileSync('./phase4b-keeper-keypair.json', 'utf-8'));
    this.keeper = Keypair.fromSecretKey(new Uint8Array(keeperData));
    
    // Load IDLs
    this.vaultIdl = JSON.parse(fs.readFileSync('../phase4b-vault-idl.json', 'utf-8'));
    this.smartDialIdl = JSON.parse(fs.readFileSync('../phase4b-smart-dial-idl.json', 'utf-8'));
    
    this.initializeModules();
  }

  private initializeModules(): void {
    logger.info('Initializing keeper bot modules');
    
    // Fee update manager with real implementation
    this.feeUpdateManager = new FeeUpdateManagerPhase4B(
      this.connection,
      this.config as any,
      new PublicKey(this.config.programs.vault_program_id),
      this.vaultIdl,
      new PublicKey(this.config.token.mint_address),
      new PublicKey(this.config.pdas.vault_pda),
      this.keeper
    );
    
    // Other modules
    this.feeHarvester = new FeeHarvester(this.connection, this.config);
    this.swapManager = new SwapManager(this.connection, this.config);
    this.distributionEngine = new DistributionEngine(this.connection, this.config);
    this.twitterMonitor = new TwitterMonitor(this.config);
    this.tokenSelector = new TokenSelector(this.connection, this.config);
    
    // Set launch timestamp if available
    if (this.config.pool?.launch_timestamp) {
      this.feeUpdateManager.setLaunchTimestamp(this.config.pool.launch_timestamp);
      this.twitterMonitor.setLaunchTimestamp(this.config.pool.launch_timestamp);
    }
    
    logger.info('All modules initialized');
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
      
      // Schedule tasks
      this.scheduleFeeUpdates();
      this.scheduleHarvestChecks();
      this.scheduleMondayChecks();
      
      this.isRunning = true;
      logger.info('Keeper bot started successfully');
      
      // Initial status
      await this.logStatus();
      
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
    if (this.feeUpdateInterval) clearInterval(this.feeUpdateInterval);
    if (this.harvestInterval) clearInterval(this.harvestInterval);
    if (this.mondayCheckInterval) clearInterval(this.mondayCheckInterval);
    
    this.isRunning = false;
    logger.info('Keeper bot stopped');
  }

  private scheduleFeeUpdates(): void {
    const interval = this.config.timing.fee_update_check_interval * 1000;
    
    // Initial check
    this.checkFeeUpdate();
    
    // Schedule recurring
    this.feeUpdateInterval = setInterval(() => {
      this.checkFeeUpdate();
    }, interval);
    
    logger.info(`Scheduled fee updates every ${this.config.timing.fee_update_check_interval}s`);
  }

  private scheduleHarvestChecks(): void {
    const interval = this.config.timing.harvest_check_interval * 1000;
    
    this.harvestInterval = setInterval(() => {
      this.checkAndHarvest();
    }, interval);
    
    logger.info(`Scheduled harvest checks every ${this.config.timing.harvest_check_interval}s`);
  }

  private scheduleMondayChecks(): void {
    // Check every minute to see if it's time
    this.mondayCheckInterval = setInterval(() => {
      this.checkMondayToken();
    }, 60000);
    
    logger.info('Scheduled Monday token checks');
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

  private async checkAndHarvest(): Promise<void> {
    try {
      const shouldHarvest = await this.feeHarvester.shouldHarvest();
      if (!shouldHarvest) return;
      
      logger.info('Harvest threshold met, executing 3-step process');
      
      // Step 1: Harvest fees
      const harvestResult = await this.feeHarvester.harvest();
      if (!harvestResult.success) {
        logger.error('Harvest failed', harvestResult);
        return;
      }
      
      // Step 2: Withdraw from mint
      const withdrawResult = await this.feeHarvester.withdrawFromMint();
      if (!withdrawResult.success) {
        logger.error('Withdraw failed', withdrawResult);
        return;
      }
      
      // Step 3: Swap and distribute
      const keeperBalance = await this.swapManager.getKeeperBalance();
      const rewardToken = await this.tokenSelector.getCurrentRewardToken() || 
                          new PublicKey('So11111111111111111111111111111111111111112');
      
      const swapPlan = await this.swapManager.createSwapPlan(
        withdrawResult.amount,  // Use the actual withdrawn amount
        rewardToken,
        keeperBalance
      );
      
      const swapResult = await this.swapManager.executeSwapPlan(swapPlan);
      if (!swapResult.success) {
        logger.error('Swap failed', swapResult);
        return;
      }
      
      // Log swap results
      logger.info('Swaps completed', {
        ownerReceived: swapResult.finalAmounts.ownerReceived / 1e9,
        ownerToken: swapResult.finalAmounts.ownerToken,
        holdersReceived: swapResult.finalAmounts.holdersReceived / 1e9,
        holdersToken: swapResult.finalAmounts.holdersToken,
        keeperTopUp: swapResult.finalAmounts.keeperTopUp / 1e9,
      });
      
      // Distribute to holders
      const distributionPlan = await this.distributionEngine.createDistributionPlan(
        swapResult.finalAmounts.holdersReceived,
        rewardToken
      );
      
      const distributionResult = await this.distributionEngine.executeDistribution(distributionPlan);
      logger.info('Harvest cycle complete', distributionResult);
      
    } catch (error) {
      logger.error('Harvest check failed', { error });
    }
  }

  private async checkMondayToken(): Promise<void> {
    try {
      if (!this.twitterMonitor.isTimeToCheck()) return;
      
      const tweetResult = await this.twitterMonitor.checkPinnedTweet();
      if (!tweetResult.success || !tweetResult.extractedSymbol) return;
      
      const selectionResult = await this.tokenSelector.processTokenSelection(
        tweetResult.extractedSymbol
      );
      
      if (selectionResult.success && selectionResult.needsUpdate) {
        logger.info('Reward token updated', { symbol: tweetResult.extractedSymbol });
      }
    } catch (error) {
      logger.error('Monday token check failed', { error });
    }
  }

  private async logStatus(): Promise<void> {
    logger.info('=== Keeper Bot Status ===');
    logger.info('Fee Manager:', this.feeUpdateManager.getStatus());
    logger.info('Harvester:', await this.feeHarvester.getStatus());
    logger.info('Swap Manager:', this.swapManager.getStatus());
    logger.info('Distribution:', this.distributionEngine.getStatus());
    logger.info('Twitter:', this.twitterMonitor.getStatus());
    logger.info('Token Selector:', this.tokenSelector.getStatus());
    logger.info('========================');
  }

  async getStatus(): Promise<any> {
    return {
      isRunning: this.isRunning,
      modules: {
        feeUpdate: this.feeUpdateManager.getStatus(),
        harvester: await this.feeHarvester.getStatus(),
        swap: this.swapManager.getStatus(),
        distribution: this.distributionEngine.getStatus(),
        twitter: this.twitterMonitor.getStatus(),
        tokenSelector: this.tokenSelector.getStatus(),
      }
    };
  }

  async triggerFeeUpdateCheck(): Promise<void> {
    logger.info('Manually triggering fee update check');
    await this.checkFeeUpdate();
  }
}

async function main() {
  const bot = new Phase4BKeeperBot();
  
  // Initialize bot with async config loading
  await bot.init();
  
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
      console.log(JSON.stringify(await bot.getStatus(), null, 2));
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
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logger.error('Fatal error:', error instanceof Error ? error.message : String(error));
    console.error('Full error:', error);
    process.exit(1);
  });
}