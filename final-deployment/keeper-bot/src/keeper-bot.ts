import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getMint,
  getAssociatedTokenAddressSync
} from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import { getConfigManager } from '../../scripts/config-manager';
import { JupiterSwap } from './modules/jupiter-swap';
import { Logger } from './utils/logger';
import { PoolDetector } from './modules/pool-detector';
import { HolderDistributor } from './modules/holder-distributor';
import { TwitterMonitor } from './modules/twitter-monitor';
import { BirdeyeClient } from './api/birdeye-client';
import { PythClient } from './api/pyth-client';

interface KeeperConfig {
  harvest_threshold_miko: number;
  check_interval_ms: number;
  distribution: {
    owner_percent: number;
    holders_percent: number;
  };
  max_retries: number;
  retry_delay_ms: number;
  minimum_holder_value_usd: number;
}

export class KeeperBot {
  private connection: Connection;
  private keeper: Keypair;
  private vaultProgram: anchor.Program;
  private smartDialProgram: anchor.Program;
  private tokenMint: PublicKey;
  private vaultPda: PublicKey;
  private config: KeeperConfig;
  private logger: Logger;
  private jupiterSwap: JupiterSwap;
  private poolDetector: PoolDetector;
  private holderDistributor: HolderDistributor;
  private twitterMonitor: TwitterMonitor;
  private birdeyeClient: BirdeyeClient;
  private pythClient: PythClient;
  private isRunning: boolean = false;
  private configManager: any;
  
  constructor() {
    this.logger = new Logger('KeeperBot');
    this.configManager = getConfigManager();
    this.connection = this.configManager.getConnection();
    this.keeper = this.configManager.loadKeypair('keeper');
    this.tokenMint = this.configManager.getTokenMint();
    this.vaultPda = this.configManager.getVaultPda();
    
    // Load keeper config
    const configPath = path.join(__dirname, '..', 'config', 'config.json');
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    // Initialize modules
    this.jupiterSwap = new JupiterSwap(this.connection, this.keeper, this.config);
    this.poolDetector = new PoolDetector(this.connection, this.logger);
    this.holderDistributor = new HolderDistributor(this.connection, this.keeper, this.config, this.logger);
    this.twitterMonitor = new TwitterMonitor(this.config, this.logger);
    this.birdeyeClient = new BirdeyeClient(this.config.birdeye.api_key, this.logger);
    this.pythClient = new PythClient(this.config.pyth.endpoint, this.logger);
    
    this.logger.info('Keeper bot initialized', {
      keeper: this.keeper.publicKey.toBase58(),
      tokenMint: this.tokenMint.toBase58(),
      vaultPda: this.vaultPda.toBase58(),
      network: this.configManager.getNetwork()
    });
  }
  
  /**
   * Initialize programs
   */
  async initializePrograms() {
    const vaultProgramId = this.configManager.getVaultProgramId();
    const smartDialProgramId = this.configManager.getSmartDialProgramId();
    
    // Fetch IDLs
    const provider = new anchor.AnchorProvider(
      this.connection,
      new anchor.Wallet(this.keeper),
      { commitment: this.configManager.getCommitment() }
    );
    
    const vaultIdl = await anchor.Program.fetchIdl(vaultProgramId, provider);
    const smartDialIdl = await anchor.Program.fetchIdl(smartDialProgramId, provider);
    
    this.vaultProgram = new anchor.Program(vaultIdl!, vaultProgramId, provider);
    this.smartDialProgram = new anchor.Program(smartDialIdl!, smartDialProgramId, provider);
    
    this.logger.info('Programs initialized');
  }
  
  /**
   * Start the keeper bot
   */
  async start() {
    this.logger.info('Starting keeper bot...');
    
    await this.initializePrograms();
    
    // Ensure keeper has enough SOL
    await this.ensureKeeperSolBalance();
    
    // Start Twitter monitor
    await this.twitterMonitor.start();
    
    this.isRunning = true;
    
    // Main loop
    while (this.isRunning) {
      try {
        await this.performCycle();
      } catch (error) {
        this.logger.error('Cycle error', error);
        await this.sleep(this.config.retry_delay_ms);
      }
      
      // Wait for next check
      await this.sleep(this.config.check_interval_ms);
    }
  }
  
  /**
   * Stop the keeper bot
   */
  async stop() {
    this.logger.info('Stopping keeper bot...');
    this.isRunning = false;
    await this.twitterMonitor.stop();
  }
  
  /**
   * Perform one keeper cycle
   */
  async performCycle() {
    const timer = this.logger.startTimer();
    this.logger.info('Starting keeper cycle');
    
    // Ensure SOL balance before operations
    await this.ensureKeeperSolBalance();
    
    // 1. Check accumulated fees
    const totalFees = await this.checkAccumulatedFees();
    this.logger.info('Accumulated fees', { 
      totalFees: totalFees / 1e9,
      threshold: this.config.harvest_threshold_miko 
    });
    
    // 2. Check if threshold reached
    const thresholdMiko = this.config.harvest_threshold_miko * Math.pow(10, 9);
    if (totalFees < thresholdMiko) {
      this.logger.info('Threshold not reached', { 
        current: totalFees / 1e9,
        threshold: this.config.harvest_threshold_miko,
        percentage: (totalFees / thresholdMiko * 100).toFixed(2) + '%'
      });
      return;
    }
    
    // 3. Detect and update pools
    await this.updatePoolRegistry();
    
    // 4. Harvest fees
    const harvestResult = await this.harvestFees();
    if (!harvestResult.success) {
      this.logger.error('Harvest failed', harvestResult);
      return;
    }
    
    // 5. Check for reward token update
    await this.checkRewardTokenUpdate();
    
    // 6. Get current reward token
    const rewardToken = await this.getCurrentRewardToken();
    this.logger.info('Current reward token', { rewardToken: rewardToken.toBase58() });
    
    // 7. Calculate distribution amounts
    const ownerAmount = Math.floor(harvestResult.amount * this.config.distribution.owner_percent / 100);
    const holdersAmount = harvestResult.amount - ownerAmount;
    
    // 8. Distribute owner's share
    await this.distributeOwnerShare(ownerAmount, harvestResult.amount);
    
    // 9. Swap holders' share for reward token
    let rewardAmount = 0;
    if (!rewardToken.equals(this.tokenMint)) {
      const swapResult = await this.jupiterSwap.swapMikoForToken(
        this.tokenMint,
        rewardToken,
        holdersAmount
      );
      
      if (!swapResult.success) {
        this.logger.error('Swap failed', swapResult);
        return;
      }
      
      rewardAmount = swapResult.outputAmount;
    }
    
    // 10. Distribute to holders
    await this.holderDistributor.distributeToHolders(
      holdersAmount,
      rewardAmount,
      rewardToken,
      this.vaultPda
    );
    
    const duration = timer();
    this.logger.info('Keeper cycle completed', {
      duration: `${duration}ms`,
      totalDistributed: harvestResult.amount / 1e9,
      ownerAmount: ownerAmount / 1e9,
      holdersAmount: holdersAmount / 1e9
    });
    
    // Log metrics
    this.logger.logMetric('cycle_duration_ms', duration);
    this.logger.logMetric('total_distributed', harvestResult.amount / 1e9);
    this.logger.logMetric('holder_count', await this.holderDistributor.getEligibleHolderCount());
  }
  
  /**
   * Check accumulated fees across all accounts
   */
  async checkAccumulatedFees(): Promise<number> {
    const vaultState = await this.vaultProgram.account.vaultState.fetch(this.vaultPda);
    
    // Get mint withheld amount
    const mintInfo = await getMint(
      this.connection,
      this.tokenMint,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    
    // Calculate total available
    const vaultBalance = await this.getVaultBalance();
    const pendingWithheld = vaultState.pendingWithheld?.toNumber() || 0;
    
    return vaultBalance + pendingWithheld;
  }
  
  /**
   * Update pool registry with detected pools
   */
  async updatePoolRegistry() {
    try {
      const newPools = await this.poolDetector.detectNewPools(this.tokenMint);
      
      if (newPools.length === 0) {
        this.logger.debug('No new pools detected');
        return;
      }
      
      this.logger.info('New pools detected', { count: newPools.length, pools: newPools });
      
      const poolRegistryPda = this.configManager.getPoolRegistryPda();
      
      const tx = await this.vaultProgram.methods
        .updatePoolRegistry(newPools)
        .accounts({
          poolRegistry: poolRegistryPda,
          vault: this.vaultPda,
          keeperAuthority: this.keeper.publicKey,
        })
        .transaction();
      
      // Add priority fee
      const priorityFee = this.configManager.getPriorityFee();
      tx.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee.microLamports,
        })
      );
      
      const sig = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.keeper],
        { commitment: 'confirmed' }
      );
      
      this.logger.info('Pool registry updated', { signature: sig });
    } catch (error) {
      this.logger.error('Failed to update pool registry', error);
    }
  }
  
  /**
   * Harvest accumulated fees
   */
  async harvestFees(): Promise<{ success: boolean; amount: number; signature?: string }> {
    try {
      this.logger.info('Harvesting fees...');
      const timer = this.logger.startTimer();
      
      // Get all token accounts with withheld fees
      const accounts = await this.getAccountsWithWithheldFees();
      
      if (accounts.length === 0) {
        this.logger.warn('No accounts with withheld fees found');
        return { success: false, amount: 0 };
      }
      
      // Harvest in batches
      let totalHarvested = 0;
      const batchSize = 20;
      
      for (let i = 0; i < accounts.length; i += batchSize) {
        const batch = accounts.slice(i, i + batchSize);
        
        // Harvest fees instruction
        const harvestTx = await this.vaultProgram.methods
          .harvestFees(batch)
          .accounts({
            vault: this.vaultPda,
            keeperAuthority: this.keeper.publicKey,
            tokenMint: this.tokenMint,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .remainingAccounts(
            batch.map(account => ({
              pubkey: account,
              isSigner: false,
              isWritable: true
            }))
          )
          .transaction();
        
        // Add priority fee
        const priorityFee = this.configManager.getPriorityFee();
        harvestTx.add(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priorityFee.microLamports,
          }),
          ComputeBudgetProgram.setComputeUnitLimit({
            units: 400_000,
          })
        );
        
        const harvestSig = await sendAndConfirmTransaction(
          this.connection,
          harvestTx,
          [this.keeper],
          { commitment: 'confirmed' }
        );
        
        this.logger.info(`Harvested batch ${i / batchSize + 1}`, { 
          signature: harvestSig,
          accounts: batch.length 
        });
      }
      
      // Withdraw from mint
      const vaultTokenAccount = getAssociatedTokenAddressSync(
        this.tokenMint,
        this.vaultPda,
        true,
        TOKEN_2022_PROGRAM_ID
      );
      
      const withdrawTx = await this.vaultProgram.methods
        .withdrawFeesFromMint()
        .accounts({
          vault: this.vaultPda,
          keeperAuthority: this.keeper.publicKey,
          tokenMint: this.tokenMint,
          vaultTokenAccount: vaultTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .transaction();
      
      const withdrawSig = await sendAndConfirmTransaction(
        this.connection,
        withdrawTx,
        [this.keeper],
        { commitment: 'confirmed' }
      );
      
      // Get harvested amount
      const harvestedAmount = await this.getVaultBalance();
      
      const duration = timer();
      this.logger.info('Fees harvested', { 
        signature: withdrawSig,
        amount: harvestedAmount / 1e9,
        duration: `${duration}ms`
      });
      
      this.logger.logMetric('harvest_duration_ms', duration);
      this.logger.logMetric('harvest_amount', harvestedAmount / 1e9);
      
      return { success: true, amount: harvestedAmount, signature: withdrawSig };
    } catch (error) {
      this.logger.error('Harvest failed', error);
      return { success: false, amount: 0 };
    }
  }
  
  /**
   * Check if reward token needs updating
   */
  async checkRewardTokenUpdate() {
    const shouldUpdate = await this.twitterMonitor.shouldUpdateRewardToken();
    if (!shouldUpdate) {
      return;
    }
    
    const newToken = await this.twitterMonitor.getSelectedToken();
    if (!newToken) {
      this.logger.warn('No token selected from Twitter');
      return;
    }
    
    try {
      const smartDialPda = this.configManager.getSmartDialPda();
      
      const tx = await this.smartDialProgram.methods
        .updateRewardToken(newToken)
        .accounts({
          dialState: smartDialPda,
          authority: this.keeper.publicKey,
        })
        .transaction();
      
      const sig = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.keeper],
        { commitment: 'confirmed' }
      );
      
      this.logger.info('Reward token updated', {
        newToken: newToken.toBase58(),
        signature: sig
      });
      
      this.logger.logEvent('reward_token_updated', {
        oldToken: await this.getCurrentRewardToken(),
        newToken: newToken.toBase58()
      });
    } catch (error) {
      this.logger.error('Failed to update reward token', error);
    }
  }
  
  /**
   * Get current reward token from Smart Dial
   */
  async getCurrentRewardToken(): Promise<PublicKey> {
    const smartDialPda = this.configManager.getSmartDialPda();
    const smartDialState = await this.smartDialProgram.account.dialState.fetch(smartDialPda);
    return smartDialState.currentRewardToken;
  }
  
  /**
   * Distribute owner's share
   */
  async distributeOwnerShare(ownerAmount: number, totalAmount: number) {
    try {
      const vaultState = await this.vaultProgram.account.vaultState.fetch(this.vaultPda);
      const ownerTokenAccount = getAssociatedTokenAddressSync(
        this.tokenMint,
        vaultState.ownerWallet,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      const tx = await this.vaultProgram.methods
        .distributeRewards(
          new BN(ownerAmount),
          new BN(totalAmount)
        )
        .accounts({
          vault: this.vaultPda,
          keeperAuthority: this.keeper.publicKey,
          tokenMint: this.tokenMint,
          vaultTokenAccount: getAssociatedTokenAddressSync(
            this.tokenMint,
            this.vaultPda,
            true,
            TOKEN_2022_PROGRAM_ID
          ),
          ownerTokenAccount: ownerTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .transaction();
      
      // Add priority fee
      const priorityFee = this.configManager.getPriorityFee();
      tx.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee.microLamports,
        })
      );
      
      const sig = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.keeper],
        { commitment: 'confirmed' }
      );
      
      this.logger.info('Owner share distributed', {
        signature: sig,
        amount: ownerAmount / 1e9,
        recipient: vaultState.ownerWallet.toBase58()
      });
    } catch (error) {
      this.logger.error('Failed to distribute owner share', error);
      throw error;
    }
  }
  
  /**
   * Helper functions
   */
  private async getVaultBalance(): Promise<number> {
    const vaultTokenAccount = getAssociatedTokenAddressSync(
      this.tokenMint,
      this.vaultPda,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    
    try {
      const account = await getAccount(
        this.connection,
        vaultTokenAccount,
        'confirmed',
        TOKEN_2022_PROGRAM_ID
      );
      return Number(account.amount);
    } catch {
      return 0;
    }
  }
  
  private async getAccountsWithWithheldFees(): Promise<PublicKey[]> {
    // Get all token accounts for the mint
    const accounts = await this.connection.getProgramAccounts(
      TOKEN_2022_PROGRAM_ID,
      {
        filters: [
          { dataSize: 165 }, // Token account size
          { memcmp: { offset: 0, bytes: this.tokenMint.toBase58() } }
        ]
      }
    );
    
    // Filter accounts with withheld fees
    const accountsWithFees: PublicKey[] = [];
    for (const account of accounts) {
      try {
        // Parse token account data
        const tokenAccount = await getAccount(
          this.connection,
          account.pubkey,
          'confirmed',
          TOKEN_2022_PROGRAM_ID
        );
        
        // Check if account has transfer fee extension
        const extensions = tokenAccount.tlvData;
        if (!extensions || extensions.length === 0) {
          continue;
        }
        
        // Parse TLV (Type-Length-Value) encoded extensions
        let offset = 0;
        while (offset < extensions.length) {
          // Read extension type (2 bytes)
          const extensionType = extensions.readUInt16LE(offset);
          offset += 2;
          
          // Read extension length (2 bytes)
          const extensionLength = extensions.readUInt16LE(offset);
          offset += 2;
          
          // Check if this is TransferFeeAmount extension (type = 1)
          if (extensionType === 1) {
            // TransferFeeAmount structure:
            // withheld_amount: u64 (8 bytes)
            const withheldAmount = extensions.readBigUInt64LE(offset);
            
            if (withheldAmount > 0) {
              accountsWithFees.push(account.pubkey);
              this.logger.debug('Found account with withheld fees', {
                account: account.pubkey.toBase58(),
                withheldAmount: withheldAmount.toString()
              });
            }
            break;
          }
          
          // Skip to next extension
          offset += extensionLength;
        }
      } catch (error) {
        // Skip accounts that fail to parse
        this.logger.debug('Failed to parse account', {
          account: account.pubkey.toBase58(),
          error
        });
      }
    }
    
    this.logger.info('Found accounts with withheld fees', {
      total: accounts.length,
      withFees: accountsWithFees.length
    });
    
    return accountsWithFees;
  }
  
  /**
   * Check keeper SOL balance and top-up if needed
   */
  private async checkKeeperBalance() {
    const balance = await this.connection.getBalance(this.keeper.publicKey);
    const minBalance = 0.5 * LAMPORTS_PER_SOL; // 0.5 SOL minimum
    
    if (balance < minBalance) {
      this.logger.warn('Keeper SOL balance low', {
        current: balance / LAMPORTS_PER_SOL,
        minimum: minBalance / LAMPORTS_PER_SOL
      });
    }
    
    this.logger.logMetric('keeper_sol_balance', balance / LAMPORTS_PER_SOL);
    
    return { balance, needsTopUp: balance < minBalance };
  }
  
  /**
   * Ensure keeper has enough SOL for operations
   */
  private async ensureKeeperSolBalance() {
    const { balance, needsTopUp } = await this.checkKeeperBalance();
    
    if (!needsTopUp) {
      return;
    }
    
    this.logger.info('Keeper SOL balance low, initiating top-up');
    
    // Calculate how much SOL we need
    const targetBalance = 1 * LAMPORTS_PER_SOL; // Target 1 SOL
    const neededSol = targetBalance - balance;
    
    try {
      // Get current SOL price
      const solPrice = await this.pythClient.getSolPrice();
      
      // Calculate MIKO needed (add 10% buffer for slippage)
      const mikoPrice = await this.birdeyeClient.getTokenPrice(this.tokenMint.toBase58());
      const mikoNeeded = Math.ceil((neededSol / LAMPORTS_PER_SOL) * solPrice / mikoPrice * 1.1 * 1e9);
      
      this.logger.info('Calculating SOL top-up', {
        currentBalance: balance / LAMPORTS_PER_SOL,
        targetBalance: targetBalance / LAMPORTS_PER_SOL,
        neededSol: neededSol / LAMPORTS_PER_SOL,
        solPrice,
        mikoPrice,
        mikoNeeded: mikoNeeded / 1e9
      });
      
      // Check if vault has enough MIKO
      const vaultBalance = await this.getVaultBalance();
      if (vaultBalance < mikoNeeded) {
        this.logger.error('Insufficient MIKO in vault for SOL top-up', {
          vaultBalance: vaultBalance / 1e9,
          needed: mikoNeeded / 1e9
        });
        return;
      }
      
      // Use emergency withdrawal to get MIKO
      const deployer = this.configManager.loadKeypair('deployer');
      const keeperMikoAccount = getAssociatedTokenAddressSync(
        this.tokenMint,
        this.keeper.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      const withdrawTx = await this.vaultProgram.methods
        .emergencyWithdrawVault(new BN(mikoNeeded))
        .accounts({
          vault: this.vaultPda,
          authority: deployer.publicKey,
          vaultTokenAccount: getAssociatedTokenAddressSync(
            this.tokenMint,
            this.vaultPda,
            true,
            TOKEN_2022_PROGRAM_ID
          ),
          destinationTokenAccount: keeperMikoAccount,
          tokenMint: this.tokenMint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .transaction();
      
      const withdrawSig = await sendAndConfirmTransaction(
        this.connection,
        withdrawTx,
        [deployer],
        { commitment: 'confirmed' }
      );
      
      this.logger.info('Emergency withdrawal for SOL top-up', {
        signature: withdrawSig,
        amount: mikoNeeded / 1e9
      });
      
      // Swap MIKO for SOL
      const solMint = new PublicKey('So11111111111111111111111111111111111112');
      const swapResult = await this.jupiterSwap.swapTokens(
        this.tokenMint,
        solMint,
        mikoNeeded,
        this.keeper.publicKey
      );
      
      if (!swapResult.success) {
        this.logger.error('Failed to swap MIKO for SOL', swapResult);
        return;
      }
      
      this.logger.info('SOL top-up completed', {
        mikoSwapped: mikoNeeded / 1e9,
        solReceived: swapResult.outputAmount / LAMPORTS_PER_SOL,
        swapSignature: swapResult.signature
      });
      
      // Log the event
      this.logger.logEvent('keeper_sol_topup', {
        previousBalance: balance / LAMPORTS_PER_SOL,
        newBalance: (balance + swapResult.outputAmount) / LAMPORTS_PER_SOL,
        mikoUsed: mikoNeeded / 1e9,
        solReceived: swapResult.outputAmount / LAMPORTS_PER_SOL
      });
      
    } catch (error) {
      this.logger.error('Failed to top up keeper SOL balance', error);
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}