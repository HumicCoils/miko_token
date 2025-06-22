import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@project-serum/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { logger } from '../utils/logger';
import { config } from '../config';
import { JupiterClient } from '../clients/JupiterClient';
import { SmartDialService } from './SmartDialService';
import { HolderRegistryService } from './HolderRegistryService';
import * as cron from 'node-cron';

export class TaxSwapDistributor {
  private connection: Connection;
  private provider: AnchorProvider;
  private absoluteVaultProgram: Program;
  private keeperWallet: Keypair;
  private jupiterClient: JupiterClient;
  private smartDialService: SmartDialService;
  private holderRegistryService: HolderRegistryService;
  private isProcessing: boolean = false;

  constructor(
    connection: Connection,
    keeperWallet: Keypair,
    absoluteVaultProgram: Program,
    jupiterClient: JupiterClient,
    smartDialService: SmartDialService,
    holderRegistryService: HolderRegistryService
  ) {
    this.connection = connection;
    this.keeperWallet = keeperWallet;
    this.provider = new AnchorProvider(
      connection,
      new Wallet(keeperWallet),
      { commitment: 'confirmed' }
    );
    this.absoluteVaultProgram = absoluteVaultProgram;
    this.jupiterClient = jupiterClient;
    this.smartDialService = smartDialService;
    this.holderRegistryService = holderRegistryService;
  }

  /**
   * Start continuous tax swap and distribution
   * Runs every 5 minutes
   */
  async startContinuousDistribution(): Promise<void> {
    logger.info('Starting continuous tax swap and distribution (every 5 minutes)');
    
    // Run immediately on startup
    await this.processSwapAndDistribute();
    
    // Schedule every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      if (!this.isProcessing) {
        await this.processSwapAndDistribute();
      } else {
        logger.warn('Previous distribution still processing, skipping this cycle');
      }
    });
  }

  /**
   * Main process: collect tax, swap, and distribute
   */
  private async processSwapAndDistribute(): Promise<void> {
    this.isProcessing = true;
    
    try {
      logger.info('Starting tax swap and distribution cycle');
      
      // Step 1: Check tax balance
      const taxBalance = await this.checkTaxBalance();
      if (taxBalance < config.MIN_TAX_FOR_DISTRIBUTION) {
        logger.info(`Tax balance ${taxBalance} below minimum ${config.MIN_TAX_FOR_DISTRIBUTION}, skipping`);
        return;
      }

      // Step 2: Collect and distribute tax (1% owner, 4% treasury)
      await this.collectAndDistributeTax();

      // Step 3: Get current reward token from Smart Dial
      const rewardToken = await this.smartDialService.getCurrentRewardToken();
      if (!rewardToken) {
        logger.error('No reward token set in Smart Dial');
        return;
      }

      // Step 4: Get treasury balance
      const treasuryBalance = await this.getTreasuryMikoBalance();
      if (treasuryBalance === 0) {
        logger.info('No MIKO in treasury to swap');
        return;
      }

      // Step 5: Check keeper bot SOL balance
      const keeperSolBalance = await this.getKeeperSolBalance();
      const scenario = this.determineScenario(keeperSolBalance, rewardToken);

      // Step 6: Execute swap based on scenario
      await this.executeScenarioSwap(scenario, treasuryBalance, rewardToken);

      // Step 7: Update holder registry
      await this.holderRegistryService.updateHolderRegistry();

      // Step 8: Distribute rewards to eligible holders
      await this.distributeRewards(rewardToken);

      logger.info('Tax swap and distribution cycle completed successfully');
    } catch (error) {
      logger.error('Error in tax swap and distribution:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Check tax balance in holding account
   */
  private async checkTaxBalance(): Promise<number> {
    const [taxHoldingPda] = await PublicKey.findProgramAddress(
      [Buffer.from('tax_holding')],
      this.absoluteVaultProgram.programId
    );

    const taxHoldingTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(config.MIKO_TOKEN_MINT),
      taxHoldingPda,
      true
    );

    const balance = await this.connection.getTokenAccountBalance(taxHoldingTokenAccount);
    return balance.value.uiAmount || 0;
  }

  /**
   * Collect tax and distribute to owner and treasury
   */
  private async collectAndDistributeTax(): Promise<void> {
    const tx = await this.absoluteVaultProgram.methods
      .collectAndDistribute()
      .accounts({
        keeperBot: this.keeperWallet.publicKey,
        // ... other accounts
      })
      .rpc();

    logger.info(`Tax collected and distributed: ${tx}`);
  }

  /**
   * Get treasury MIKO balance
   */
  private async getTreasuryMikoBalance(): Promise<number> {
    const treasuryWallet = new PublicKey(config.TREASURY_WALLET);
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(config.MIKO_TOKEN_MINT),
      treasuryWallet
    );

    const balance = await this.connection.getTokenAccountBalance(treasuryTokenAccount);
    return balance.value.uiAmount || 0;
  }

  /**
   * Get keeper bot SOL balance
   */
  private async getKeeperSolBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.keeperWallet.publicKey);
    return balance / 1e9; // Convert lamports to SOL
  }

  /**
   * Determine which scenario to execute
   */
  private determineScenario(keeperSolBalance: number, rewardToken: PublicKey): number {
    const isRewardTokenSol = rewardToken.equals(PublicKey.default); // Check if reward is SOL
    
    if (isRewardTokenSol) {
      return 3; // Scenario 3: Reward token is SOL
    } else if (keeperSolBalance < 0.05) {
      return 2; // Scenario 2: Low SOL balance
    } else {
      return 1; // Scenario 1: Normal operation
    }
  }

  /**
   * Execute swap based on scenario
   */
  private async executeScenarioSwap(
    scenario: number,
    treasuryBalance: number,
    rewardToken: PublicKey
  ): Promise<void> {
    logger.info(`Executing scenario ${scenario} swap`);

    switch (scenario) {
      case 1: // Normal operation
        await this.executeNormalSwap(treasuryBalance, rewardToken);
        break;
      
      case 2: // Low SOL balance
        await this.executeLowSolSwap(treasuryBalance, rewardToken);
        break;
      
      case 3: // Reward token is SOL
        await this.executeSolRewardSwap(treasuryBalance);
        break;
    }
  }

  /**
   * Scenario 1: Normal swap - all to reward token
   */
  private async executeNormalSwap(amount: number, rewardToken: PublicKey): Promise<void> {
    const swapResult = await this.jupiterClient.swap(
      new PublicKey(config.MIKO_TOKEN_MINT),
      rewardToken,
      amount,
      config.TREASURY_WALLET
    );

    logger.info(`Swapped ${amount} MIKO to reward token: ${swapResult.txId}`);
  }

  /**
   * Scenario 2: Low SOL - split 80/20
   */
  private async executeLowSolSwap(amount: number, rewardToken: PublicKey): Promise<void> {
    const rewardAmount = amount * 0.8; // 80% to rewards
    const solAmount = amount * 0.2;    // 20% to SOL

    // Swap 80% to reward token
    await this.jupiterClient.swap(
      new PublicKey(config.MIKO_TOKEN_MINT),
      rewardToken,
      rewardAmount,
      config.TREASURY_WALLET
    );

    // Swap 20% to SOL
    await this.jupiterClient.swap(
      new PublicKey(config.MIKO_TOKEN_MINT),
      PublicKey.default, // SOL
      solAmount,
      config.TREASURY_WALLET
    );

    // Transfer SOL to keeper bot (keep 0.1 SOL)
    await this.maintainKeeperSolBalance();
  }

  /**
   * Scenario 3: SOL reward - all to SOL
   */
  private async executeSolRewardSwap(amount: number): Promise<void> {
    await this.jupiterClient.swap(
      new PublicKey(config.MIKO_TOKEN_MINT),
      PublicKey.default, // SOL
      amount,
      config.TREASURY_WALLET
    );

    // Handle SOL distribution (80% to holders, 20% maintenance)
    await this.maintainKeeperSolBalance();
  }

  /**
   * Maintain keeper bot SOL balance at 0.1 SOL
   */
  private async maintainKeeperSolBalance(): Promise<void> {
    const currentBalance = await this.getKeeperSolBalance();
    const targetBalance = 0.1;
    
    if (currentBalance > targetBalance) {
      const excess = currentBalance - targetBalance;
      // Transfer excess to owner
      logger.info(`Transferring ${excess} SOL to owner`);
      // Implementation for SOL transfer...
    }
  }

  /**
   * Distribute rewards to eligible holders
   */
  private async distributeRewards(rewardToken: PublicKey): Promise<void> {
    try {
      const eligibleHolders = await this.holderRegistryService.getEligibleHolders();
      logger.info(`Distributing rewards to ${eligibleHolders.length} eligible holders`);

      // Calculate pro-rata distribution
      const totalHoldings = eligibleHolders.reduce((sum, h) => sum + h.balance, 0);
      
      for (const holder of eligibleHolders) {
        const share = holder.balance / totalHoldings;
        // Implementation for reward distribution...
      }
    } catch (error) {
      logger.error('Error distributing rewards:', error);
      throw error;
    }
  }
}