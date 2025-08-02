import { 
  Connection, 
  Keypair, 
  PublicKey,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync
} from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { getConfigManager } from '../../scripts/config-manager';
import { JupiterSwap } from './modules/jupiter-swap';
import { Logger } from './utils/logger';
import { PoolDetector } from './modules/pool-detector';
import { HolderDistributor } from './modules/holder-distributor';
import { TwitterMonitor } from './modules/twitter-monitor';
import { BirdeyeClient } from './api/birdeye-client';
import { PythClient } from './api/pyth-client';

// Test modules
import { MockBirdeyeClient } from './test/mock-birdeye-client';
import { RaydiumSwapService } from './test/raydium-swap-service';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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
  private vaultProgram!: anchor.Program;
  private smartDialProgram!: anchor.Program;
  private tokenMint: PublicKey;
  private vaultPda: PublicKey;
  private config: KeeperConfig;
  private logger: Logger;
  private swapService: JupiterSwap | RaydiumSwapService;
  private poolDetector: PoolDetector;
  private holderDistributor: HolderDistributor;
  private twitterMonitor: TwitterMonitor;
  private birdeyeClient: BirdeyeClient | MockBirdeyeClient;
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
    
    // Check network and initialize appropriate modules
    const network = process.env.NETWORK || 'localnet';
    const isProduction = network === 'mainnet';
    
    this.logger.info('Initializing keeper bot', { network, isProduction });
    
    // Initialize swap service based on network
    if (isProduction) {
      this.swapService = new JupiterSwap(this.connection, this.keeper, this.config);
      this.birdeyeClient = new BirdeyeClient(process.env.BIRDEYE_API_KEY || '', this.logger);
    } else {
      this.swapService = new RaydiumSwapService(this.connection, this.keeper, this.config);
      this.birdeyeClient = new MockBirdeyeClient(this.connection, this.logger);
    }
    
    // Initialize other modules
    this.poolDetector = new PoolDetector(this.connection, this.logger);
    this.holderDistributor = new HolderDistributor(this.connection, this.keeper, this.config, this.logger, this.birdeyeClient);
    this.twitterMonitor = new TwitterMonitor(this.config, this.logger);
    this.pythClient = new PythClient(process.env.PYTH_ENDPOINT || 'https://hermes.pyth.network', this.logger);
    
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
    
    // Load IDLs from local files
    const vaultIdlPath = path.join(__dirname, '..', '..', 'idl', 'absolute_vault.json');
    const smartDialIdlPath = path.join(__dirname, '..', '..', 'idl', 'smart_dial.json');
    
    const vaultIdl = JSON.parse(fs.readFileSync(vaultIdlPath, 'utf-8'));
    const smartDialIdl = JSON.parse(fs.readFileSync(smartDialIdlPath, 'utf-8'));
    
    vaultIdl.address = vaultProgramId.toBase58();
    smartDialIdl.address = smartDialProgramId.toBase58();
    
    this.vaultProgram = new anchor.Program(vaultIdl, provider);
    this.smartDialProgram = new anchor.Program(smartDialIdl, provider);
    
    this.logger.info('Programs initialized');
  }
  
  /**
   * Start the keeper bot
   */
  async start() {
    this.logger.info('Starting keeper bot...');
    
    await this.initializePrograms();
    
    // Check keeper SOL balance - will be handled in distribution if needed
    const keeperBalance = await this.connection.getBalance(this.keeper.publicKey);
    this.logger.logMetric('keeper_sol_balance', keeperBalance / LAMPORTS_PER_SOL);
    if (keeperBalance < 0.05 * LAMPORTS_PER_SOL) {
      this.logger.warn('Keeper SOL balance low, will top-up during distribution', {
        current: keeperBalance / LAMPORTS_PER_SOL
      });
    }
    
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
    
    // Check if keeper needs SOL - will be handled during distribution
    const keeperBalance = await this.connection.getBalance(this.keeper.publicKey);
    const keeperNeedsSol = keeperBalance < 0.05 * LAMPORTS_PER_SOL;
    
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
    
    // 7. Handle tax distribution with keeper SOL top-up scenarios
    const solMint = new PublicKey('So11111111111111111111111111111111111111112');
    const isRewardSol = rewardToken.equals(solMint);
    
    // Handle keeper SOL top-up if needed
    if (keeperNeedsSol) {
      const targetBalance = 0.10 * LAMPORTS_PER_SOL; // Target 0.10 SOL
      const neededSol = Math.max(0, targetBalance - keeperBalance);
      
      this.logger.info('Keeper needs SOL top-up', {
        current: keeperBalance / LAMPORTS_PER_SOL,
        target: targetBalance / LAMPORTS_PER_SOL,
        needed: neededSol / LAMPORTS_PER_SOL
      });
      
      // Tax flow implementation - need to handle swaps first
      // Note: We'll handle keeper top-up after swapping to appropriate token
    }
    
    // 8. Withdraw all harvested fees to keeper for processing
    this.logger.info('Withdrawing harvested fees to keeper', {
      amount: harvestResult.amount / 1e9
    });
    
    // Ensure keeper has MIKO token account
    const keeperMikoAccount = getAssociatedTokenAddressSync(
      this.tokenMint,
      this.keeper.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    // Check if account exists, create if not
    const keeperMikoInfo = await this.connection.getAccountInfo(keeperMikoAccount);
    if (!keeperMikoInfo) {
      const { createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
      const createIx = createAssociatedTokenAccountInstruction(
        this.keeper.publicKey,
        keeperMikoAccount,
        this.keeper.publicKey,
        this.tokenMint,
        TOKEN_2022_PROGRAM_ID
      );
      const createTx = new anchor.web3.Transaction().add(createIx);
      await sendAndConfirmTransaction(
        this.connection,
        createTx,
        [this.keeper],
        { commitment: 'confirmed' }
      );
    }
    
    // Withdraw all harvested fees to keeper
    const withdrawTx = await this.vaultProgram.methods
      .withdrawHarvestedFees(new BN(Math.floor(harvestResult.amount)))
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
        keeperTokenAccount: keeperMikoAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
      
    this.logger.info('Withdrew all harvested fees to keeper', {
      signature: withdrawTx,
      amount: harvestResult.amount / 1e9
    });
    
    // 9. Handle tax flow scenarios
    if (isRewardSol) {
      // Scenario 1: Reward token is SOL - swap all MIKO to SOL
      this.logger.info('Reward token is SOL, swapping all MIKO to SOL', {
        mikoAmount: harvestResult.amount / 1e9
      });
      
      const swapResult = await this.swapService.swapTokens(
        this.tokenMint,
        solMint,
        harvestResult.amount,
        this.keeper.publicKey
      );
      
      if (!swapResult.success) {
        this.logger.error('Failed to swap MIKO to SOL', swapResult);
        return;
      }
      
      const totalSol = swapResult.outputAmount;
      this.logger.info('Swapped MIKO to SOL', {
        mikoIn: harvestResult.amount / 1e9,
        solOut: totalSol / LAMPORTS_PER_SOL
      });
      
      // Calculate distribution amounts
      let keeperSolAmount = 0;
      let ownerSolAmount = Math.floor(totalSol * this.config.distribution.owner_percent / 100);
      let holdersSolAmount = totalSol - ownerSolAmount;
      
      if (keeperNeedsSol) {
        // Use up to owner's 20% for keeper top-up
        const neededSol = Math.max(0, 0.10 * LAMPORTS_PER_SOL - keeperBalance);
        keeperSolAmount = Math.min(ownerSolAmount, neededSol);
        ownerSolAmount -= keeperSolAmount;
        
        this.logger.info('Keeper SOL top-up allocated', {
          needed: neededSol / LAMPORTS_PER_SOL,
          allocated: keeperSolAmount / LAMPORTS_PER_SOL,
          remainingOwner: ownerSolAmount / LAMPORTS_PER_SOL
        });
      }
      
      // Transfer SOL to owner (if any remaining after keeper top-up)
      if (ownerSolAmount > 0) {
        const vaultState = await (this.vaultProgram.account as any).vaultState.fetch(this.vaultPda);
        const { SystemProgram } = anchor.web3;
        
        const ownerTransferIx = SystemProgram.transfer({
          fromPubkey: this.keeper.publicKey,
          toPubkey: vaultState.ownerWallet,
          lamports: ownerSolAmount,
        });
        
        const ownerTx = new anchor.web3.Transaction().add(ownerTransferIx);
        const ownerSig = await sendAndConfirmTransaction(
          this.connection,
          ownerTx,
          [this.keeper],
          { commitment: 'confirmed' }
        );
        
        this.logger.info('Owner SOL distributed', {
          signature: ownerSig,
          amount: ownerSolAmount / LAMPORTS_PER_SOL,
          recipient: vaultState.ownerWallet.toBase58()
        });
      }
      
      // Distribute SOL to holders
      const vaultState = await (this.vaultProgram.account as any).vaultState.fetch(this.vaultPda);
      this.holderDistributor.setOwnerWallet(vaultState.ownerWallet);
      
      await this.holderDistributor.distributeToHolders(
        0, // No MIKO amount
        holdersSolAmount,
        rewardToken,
        this.keeper.publicKey // Distribute from keeper since they hold the SOL
      );
      
    } else {
      // Scenario 2: Reward token is NOT SOL
      this.logger.info('Reward token is not SOL, handling MIKO distribution', {
        rewardToken: rewardToken.toBase58(),
        mikoAmount: harvestResult.amount / 1e9
      });
      
      // Calculate base distribution
      let ownerMikoAmount = Math.floor(harvestResult.amount * this.config.distribution.owner_percent / 100);
      let holdersMikoAmount = harvestResult.amount - ownerMikoAmount;
      
      if (keeperNeedsSol) {
        // Need to swap some of owner's MIKO to SOL for keeper
        const targetBalance = 0.10 * LAMPORTS_PER_SOL;
        const neededSol = Math.max(0, targetBalance - keeperBalance);
        
        // Calculate MIKO needed for SOL
        const solPrice = await this.pythClient.getSolPrice();
        const mikoPrice = await this.birdeyeClient.getTokenPrice(this.tokenMint.toBase58());
        const mikoForSol = Math.ceil((neededSol / LAMPORTS_PER_SOL) * solPrice / mikoPrice * 1.1 * 1e9);
        const keeperMikoAmount = Math.min(ownerMikoAmount, mikoForSol);
        
        if (keeperMikoAmount > 0) {
          // Swap some MIKO to SOL for keeper
          const swapResult = await this.swapService.swapTokens(
            this.tokenMint,
            solMint,
            keeperMikoAmount,
            this.keeper.publicKey
          );
          
          if (swapResult.success) {
            this.logger.info('Keeper SOL top-up from owner portion', {
              mikoUsed: keeperMikoAmount / 1e9,
              solReceived: swapResult.outputAmount / LAMPORTS_PER_SOL
            });
          }
          
          // Adjust owner amount
          ownerMikoAmount = ownerMikoAmount - keeperMikoAmount;
        }
      }
      
      // Swap remaining owner portion to reward token
      if (ownerMikoAmount > 0) {
        const ownerSwapResult = await this.swapService.swapMikoForToken(
          this.tokenMint,
          rewardToken,
          ownerMikoAmount
        );
        
        if (ownerSwapResult.success) {
          // Transfer swapped reward tokens to owner
          const vaultState = await (this.vaultProgram.account as any).vaultState.fetch(this.vaultPda);
          const ownerRewardAccount = getAssociatedTokenAddressSync(
            rewardToken,
            vaultState.ownerWallet,
            false,
            rewardToken.equals(solMint) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID
          );
          
          const keeperRewardAccount = getAssociatedTokenAddressSync(
            rewardToken,
            this.keeper.publicKey,
            false,
            rewardToken.equals(solMint) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID
          );
          
          // Create transfer instruction
          const { createTransferInstruction } = await import('@solana/spl-token');
          const transferIx = createTransferInstruction(
            keeperRewardAccount,
            ownerRewardAccount,
            this.keeper.publicKey,
            ownerSwapResult.outputAmount,
            [],
            rewardToken.equals(solMint) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID
          );
          
          const transferTx = new anchor.web3.Transaction().add(transferIx);
          
          // Add priority fee
          const priorityFee = this.configManager.getPriorityFee();
          transferTx.add(
            ComputeBudgetProgram.setComputeUnitPrice({
              microLamports: priorityFee.microLamports,
            })
          );
          
          const transferSig = await sendAndConfirmTransaction(
            this.connection,
            transferTx,
            [this.keeper],
            { commitment: 'confirmed' }
          );
          
          this.logger.info('Owner reward tokens transferred', {
            signature: transferSig,
            amount: ownerSwapResult.outputAmount,
            recipient: vaultState.ownerWallet.toBase58()
          });
        }
      }
      
      // Swap holders' share to reward token
      const holdersSwapResult = await this.swapService.swapMikoForToken(
        this.tokenMint,
        rewardToken,
        holdersMikoAmount
      );
      
      if (!holdersSwapResult.success) {
        this.logger.error('Failed to swap holders share', holdersSwapResult);
        return;
      }
      
      // Distribute to holders
      const vaultState = await (this.vaultProgram.account as any).vaultState.fetch(this.vaultPda);
      this.holderDistributor.setOwnerWallet(vaultState.ownerWallet);
      
      await this.holderDistributor.distributeToHolders(
        0, // No MIKO amount (already swapped)
        holdersSwapResult.outputAmount,
        rewardToken,
        this.keeper.publicKey // Distribute from keeper
      );
    }
    
    const duration = timer();
    this.logger.info('Keeper cycle completed', {
      duration: `${duration}ms`,
      totalHarvested: harvestResult.amount / 1e9,
      rewardToken: rewardToken.toBase58()
    });
    
    // Log metrics
    this.logger.logMetric('cycle_duration_ms', duration);
    this.logger.logMetric('total_distributed', harvestResult.amount / 1e9);
    this.logger.logMetric('holder_count', await this.holderDistributor.getEligibleHolderCount());
  }
  
  /**
   * Check accumulated fees across all accounts and mint
   */
  async checkAccumulatedFees(): Promise<number> {
    // First check mint's withheld amount
    let mintWithheld = 0;
    try {
      const { getMint } = await import('@solana/spl-token');
      const mintInfo = await getMint(
        this.connection,
        this.tokenMint,
        'confirmed',
        TOKEN_2022_PROGRAM_ID
      );
      
      // Check if mint has transfer fee extension
      if (mintInfo.tlvData && mintInfo.tlvData.length > 0) {
        const extensions = mintInfo.tlvData;
        let offset = 0;
        
        while (offset < extensions.length - 2) {
          const extensionType = extensions.readUInt16LE(offset);
          const extensionLength = extensions.readUInt16LE(offset + 2);
          
          // TransferFeeConfig extension type = 1
          if (extensionType === 1) {
            // Skip to withheldAmount field in TransferFeeConfig
            // Structure: transferFeeBasisPoints (2), maximumFee (8), transferFeeConfigAuthority (33), withdrawWithheldAuthority (33), withheldAmount (8)
            const withheldOffset = offset + 4 + 2 + 8 + 33 + 33;
            if (withheldOffset + 8 <= offset + 4 + extensionLength) {
              mintWithheld = Number(extensions.readBigUInt64LE(withheldOffset));
              if (mintWithheld > 0) {
                this.logger.info('Found withheld fees in mint', {
                  amount: mintWithheld / 1e9
                });
              }
            }
            break;
          }
          
          offset += 4 + extensionLength;
        }
      }
    } catch (error) {
      this.logger.error('Failed to check mint withheld amount', error);
    }
    
    // Get all token accounts for the mint
    const accounts = await this.connection.getProgramAccounts(
      TOKEN_2022_PROGRAM_ID,
      {
        filters: [
          // Remove dataSize filter to catch accounts with extensions
          { memcmp: { offset: 0, bytes: this.tokenMint.toBase58() } }
        ]
      }
    );
    
    this.logger.info('Checking accumulated fees across all accounts', {
      totalAccounts: accounts.length,
      mintWithheld: mintWithheld / 1e9
    });
    
    let totalWithheld = mintWithheld;
    let accountsWithFees = 0;
    
    // Check each account for withheld fees
    for (const account of accounts) {
      try {
        const tokenAccount = await getAccount(
          this.connection,
          account.pubkey,
          'confirmed',
          TOKEN_2022_PROGRAM_ID
        );
        
        // Check if account has transfer fee extension data
        const extensions = tokenAccount.tlvData;
        if (!extensions || extensions.length === 0) {
          continue;
        }
        
        // Parse extensions to find withheld amount
        let offset = 0;
        while (offset < extensions.length - 2) {
          const extensionType = extensions.readUInt16LE(offset);
          const extensionLength = extensions.readUInt16LE(offset + 2);
          
          // TransferFeeAmount extension type = 2
          if (extensionType === 2) {
            // withheldAmount is the first field (u64)
            const withheldAmount = Number(extensions.readBigUInt64LE(offset + 4));
            if (withheldAmount > 0) {
              totalWithheld += withheldAmount;
              accountsWithFees++;
              this.logger.debug('Found withheld fees', {
                account: account.pubkey.toBase58(),
                withheld: withheldAmount / 1e9,
                owner: tokenAccount.owner.toBase58()
              });
            }
            break;
          }
          
          offset += 4 + extensionLength;
        }
      } catch (error) {
        // Skip accounts we can't read
        continue;
      }
    }
    
    this.logger.info('Total accumulated fees found', {
      totalWithheld: totalWithheld / 1e9,
      accountsWithFees,
      accountsScanned: accounts.length
    });
    
    return totalWithheld;
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
        this.logger.info('No accounts with withheld fees found, will check mint directly');
      }
      
      // Get initial vault balance to track harvested amount
      const initialVaultBalance = await this.getVaultBalance();
      
      // Harvest from accounts if any have withheld fees
      if (accounts.length > 0) {
        const batchSize = 10;
        
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
      }
      
      // Always withdraw from mint to vault (mint may have accumulated fees)
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
      
      // Get final vault balance and calculate harvested amount
      const finalVaultBalance = await this.getVaultBalance();
      const harvestedAmount = finalVaultBalance - initialVaultBalance;
      
      const duration = timer();
      this.logger.info('Fees harvested', { 
        signature: withdrawSig,
        amount: harvestedAmount / 1e9,
        duration: `${duration}ms`,
        initialBalance: initialVaultBalance / 1e9,
        finalBalance: finalVaultBalance / 1e9
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
    const smartDialState = await (this.smartDialProgram.account as any).dialState.fetch(smartDialPda);
    return smartDialState.currentRewardToken;
  }
  
  /**
   * Distribute owner's share
   */
  async distributeOwnerShare(ownerAmount: number, totalAmount: number) {
    try {
      const vaultState = await (this.vaultProgram.account as any).vaultState.fetch(this.vaultPda);
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
          // Remove dataSize filter to catch accounts with extensions
          { memcmp: { offset: 0, bytes: this.tokenMint.toBase58() } }
        ]
      }
    );
    
    this.logger.info('Scanning for accounts with withheld fees', {
      totalAccounts: accounts.length
    });
    
    // Filter accounts with withheld fees
    const accountsWithFees: PublicKey[] = [];
    let totalWithheldFound = 0;
    
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
          
          // Check if this is TransferFeeAmount extension (type = 2)
          if (extensionType === 2) {
            // TransferFeeAmount structure:
            // withheld_amount: u64 (8 bytes)
            const withheldAmount = extensions.readBigUInt64LE(offset);
            
            if (withheldAmount > 0) {
              accountsWithFees.push(account.pubkey);
              totalWithheldFound += Number(withheldAmount);
              this.logger.debug('Found account with withheld fees', {
                account: account.pubkey.toBase58(),
                withheldAmount: Number(withheldAmount) / 1e9,
                owner: tokenAccount.owner.toBase58()
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
      totalAccounts: accounts.length,
      accountsWithFees: accountsWithFees.length,
      totalWithheld: totalWithheldFound / 1e9
    });
    
    return accountsWithFees;
  }
  
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
}