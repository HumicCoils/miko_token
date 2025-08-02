import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getMint,
  getAccount
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import { BirdeyeClient, TokenHolder } from '../api/birdeye-client';
import { PythClient } from '../api/pyth-client';
import { Logger } from '../utils/logger';
import { getConfigManager } from '../../../scripts/config-manager';

interface HolderInfo {
  owner: string;
  balance: number;
  value: number;
  percentage: number;
}

interface DistributionResult {
  success: boolean;
  recipientsCount: number;
  totalDistributed: number;
  signatures: string[];
  error?: string;
}

interface UndistributedBalance {
  amount: number;
  token: string;
  lastUpdate: number;
}

export class HolderDistributor {
  private connection: Connection;
  private keeper: Keypair;
  private config: any;
  private logger: Logger;
  private birdeyeClient: BirdeyeClient | any; // Accept any client with compatible interface
  private pythClient: PythClient;
  private undistributedPath: string;
  private excludedPools: Set<string> = new Set();
  private configManager: any;
  private ownerWallet: PublicKey | null = null;
  
  constructor(connection: Connection, keeper: Keypair, config: any, logger: Logger, birdeyeClient?: any) {
    this.connection = connection;
    this.keeper = keeper;
    this.config = config;
    this.logger = logger;
    this.configManager = getConfigManager();
    // Use provided client or create default
    this.birdeyeClient = birdeyeClient || new BirdeyeClient(config.birdeye?.api_key || '', logger);
    this.pythClient = new PythClient(config.pyth?.endpoint || 'https://hermes.pyth.network', logger);
    
    // Path for storing undistributed balance data
    this.undistributedPath = path.join(__dirname, '..', '..', 'data', 'undistributed.json');
    this.ensureDataDirectory();
  }
  
  /**
   * Set excluded pools for reward distribution
   */
  setExcludedPools(pools: PublicKey[]) {
    this.excludedPools.clear();
    for (const pool of pools) {
      this.excludedPools.add(pool.toBase58());
    }
    this.logger.info('Updated excluded pools for reward distribution', {
      count: pools.length
    });
  }
  
  /**
   * Set owner wallet for exclusion from rewards
   */
  setOwnerWallet(ownerWallet: PublicKey) {
    this.ownerWallet = ownerWallet;
    this.logger.info('Set owner wallet for reward exclusion', {
      owner: ownerWallet.toBase58()
    });
  }
  
  /**
   * Distribute rewards to eligible holders
   */
  async distributeToHolders(
    mikoAmount: number,
    rewardAmount: number,
    rewardToken: PublicKey,
    vaultPda: PublicKey
  ): Promise<DistributionResult> {
    try {
      this.logger.info('Starting holder distribution', {
        mikoAmount: mikoAmount / 1e9,
        rewardAmount: rewardAmount / 1e9,
        rewardToken: rewardToken.toBase58()
      });
      
      // Check for previous undistributed balance
      const undistributed = this.loadUndistributed();
      let totalToDistribute = rewardAmount;
      
      if (undistributed && undistributed.token === rewardToken.toBase58()) {
        this.logger.info('Found previous undistributed balance', {
          amount: undistributed.amount / 1e9,
          token: undistributed.token,
          lastUpdate: new Date(undistributed.lastUpdate).toISOString()
        });
        totalToDistribute += undistributed.amount;
      }
      
      // Get MIKO token mint from deployment state
      const mikoMint = this.configManager.getTokenMint();
      
      // Get eligible holders
      const eligibleHolders = await this.getEligibleHolders(mikoMint);
      
      if (eligibleHolders.length === 0) {
        this.logger.warn('No eligible holders found - saving for next distribution', {
          amount: totalToDistribute / 1e9,
          token: rewardToken.toBase58()
        });
        
        // Save undistributed amount for next cycle
        this.saveUndistributed({
          amount: totalToDistribute,
          token: rewardToken.toBase58(),
          lastUpdate: Date.now()
        });
        
        return {
          success: true,
          recipientsCount: 0,
          totalDistributed: 0,
          signatures: [],
          error: 'No eligible holders - saved for next distribution'
        };
      }
      
      this.logger.info('Eligible holders found', {
        count: eligibleHolders.length,
        totalPercentage: eligibleHolders.reduce((sum, h) => sum + h.percentage, 0).toFixed(2)
      });
      
      // Calculate distribution amounts per holder
      const distributions = eligibleHolders.map(holder => ({
        recipient: new PublicKey(holder.owner),
        amount: Math.floor(totalToDistribute * holder.percentage / 100),
        percentage: holder.percentage
      }));
      
      // Distribute in batches
      const signatures: string[] = [];
      const batchSize = this.config.batch_size?.distribution || 50;
      let totalDistributed = 0;
      
      for (let i = 0; i < distributions.length; i += batchSize) {
        const batch = distributions.slice(i, i + batchSize);
        
        try {
          const sig = await this.distributeRewardBatch(
            batch,
            rewardToken,
            vaultPda
          );
          
          signatures.push(sig);
          totalDistributed += batch.reduce((sum, d) => sum + d.amount, 0);
          
          this.logger.info(`Distributed batch ${Math.floor(i / batchSize) + 1}`, {
            recipients: batch.length,
            amount: batch.reduce((sum, d) => sum + d.amount, 0) / 1e9,
            signature: sig
          });
          
          // Rate limiting between batches
          if (i + batchSize < distributions.length) {
            await this.sleep(1000);
          }
        } catch (error) {
          this.logger.error(`Failed to distribute batch ${Math.floor(i / batchSize) + 1}`, error);
          // Continue with next batch
        }
      }
      
      // Clear undistributed balance on successful distribution
      if (totalDistributed > 0) {
        this.clearUndistributed();
      }
      
      this.logger.info('Holder distribution completed', {
        recipientsCount: distributions.length,
        totalDistributed: totalDistributed / 1e9,
        batches: signatures.length
      });
      
      // Log metrics
      this.logger.logMetric('holders_rewarded', distributions.length);
      this.logger.logMetric('reward_distributed', totalDistributed / 1e9);
      
      return {
        success: true,
        recipientsCount: distributions.length,
        totalDistributed,
        signatures
      };
      
    } catch (error: any) {
      this.logger.error('Holder distribution failed', error);
      return {
        success: false,
        recipientsCount: 0,
        totalDistributed: 0,
        signatures: [],
        error: error.message
      };
    }
  }
  
  /**
   * Get eligible holders (minimum $100 value, excluding pools and system accounts)
   */
  private async getEligibleHolders(tokenMint: PublicKey): Promise<HolderInfo[]> {
    try {
      // Get all holders from Birdeye
      const holders = await this.birdeyeClient.getTokenHolders(tokenMint.toBase58(), 1000);
      
      // Get current MIKO price
      const mikoPrice = await this.birdeyeClient.getTokenPrice(tokenMint.toBase58());
      
      if (mikoPrice === 0) {
        this.logger.warn('Unable to get MIKO price, using fallback calculation');
        // Fallback: estimate based on SOL price
        const solPrice = await this.pythClient.getSolPrice();
        const estimatedPrice = 0.001 * solPrice; // Rough estimate
        return this.getEligibleHoldersWithPrice(holders, estimatedPrice);
      }
      
      return this.getEligibleHoldersWithPrice(holders, mikoPrice);
      
    } catch (error) {
      this.logger.error('Failed to get eligible holders from Birdeye', error);
      
      // Fallback: use on-chain data
      return this.getEligibleHoldersOnChain(tokenMint);
    }
  }
  
  /**
   * Filter holders by eligibility criteria
   */
  private async getEligibleHoldersWithPrice(holders: TokenHolder[], mikoPrice: number): Promise<HolderInfo[]> {
    const minValueUsd = this.config.minimum_holder_value_usd || 100;
    const eligibleHolders: HolderInfo[] = [];
    let totalEligibleBalance = 0;
    
    for (const holder of holders) {
      // Skip excluded pools
      if (this.excludedPools.has(holder.owner)) {
        this.logger.debug('Excluding pool from rewards', { pool: holder.owner });
        continue;
      }
      
      // Skip system accounts
      if (await this.isSystemAccount(holder.owner)) {
        this.logger.debug('Excluding system account from rewards', { account: holder.owner });
        continue;
      }
      
      const valueUsd = (holder.balance / 1e9) * mikoPrice;
      
      if (valueUsd >= minValueUsd) {
        eligibleHolders.push({
          owner: holder.owner,
          balance: holder.balance,
          value: valueUsd,
          percentage: 0 // Will calculate after
        });
        totalEligibleBalance += holder.balance;
      }
    }
    
    // Calculate percentages
    for (const holder of eligibleHolders) {
      holder.percentage = (holder.balance / totalEligibleBalance) * 100;
    }
    
    this.logger.info('Holder eligibility calculated', {
      totalHolders: holders.length,
      eligibleHolders: eligibleHolders.length,
      excludedPools: this.excludedPools.size,
      minValueUsd,
      mikoPrice
    });
    
    return eligibleHolders.sort((a, b) => b.balance - a.balance);
  }
  
  /**
   * Fallback: Get holders from on-chain data
   */
  private async getEligibleHoldersOnChain(tokenMint: PublicKey): Promise<HolderInfo[]> {
    try {
      this.logger.info('Using on-chain fallback for holder detection');
      
      // Get all token accounts
      const accounts = await this.connection.getProgramAccounts(
        TOKEN_2022_PROGRAM_ID,
        {
          filters: [
            { dataSize: 165 }, // Token account size
            { memcmp: { offset: 0, bytes: tokenMint.toBase58() } }
          ]
        }
      );
      
      // Get price for value calculation
      const solPrice = await this.pythClient.getSolPrice();
      const mikoPrice = 0.001 * solPrice; // Rough estimate if Birdeye fails
      
      const eligibleHolders: HolderInfo[] = [];
      const minValueUsd = this.config.minimum_holder_value_usd || 100;
      let totalEligibleBalance = 0;
      
      for (const account of accounts) {
        try {
          const tokenAccount = await getAccount(
            this.connection,
            account.pubkey,
            'confirmed',
            TOKEN_2022_PROGRAM_ID
          );
          
          const owner = tokenAccount.owner.toBase58();
          const balance = Number(tokenAccount.amount);
          const valueUsd = (balance / 1e9) * mikoPrice;
          
          // Skip if below minimum
          if (valueUsd < minValueUsd) {
            continue;
          }
          
          // Skip excluded pools
          if (this.excludedPools.has(owner)) {
            continue;
          }
          
          // Skip system accounts
          if (await this.isSystemAccount(owner)) {
            continue;
          }
          
          eligibleHolders.push({
            owner,
            balance,
            value: valueUsd,
            percentage: 0
          });
          
          totalEligibleBalance += balance;
        } catch {
          // Skip invalid accounts
        }
      }
      
      // Calculate percentages
      for (const holder of eligibleHolders) {
        holder.percentage = (holder.balance / totalEligibleBalance) * 100;
      }
      
      return eligibleHolders.sort((a, b) => b.balance - a.balance);
      
    } catch (error) {
      this.logger.error('On-chain holder detection failed', error);
      return [];
    }
  }
  
  /**
   * Check if account is a system account
   */
  private async isSystemAccount(owner: string): Promise<boolean> {
    const ownerPubkey = new PublicKey(owner);
    
    // System accounts to exclude
    const vaultPda = this.configManager.getVaultPda();
    
    const systemAccounts = [
      this.keeper.publicKey,
      vaultPda,
      TOKEN_2022_PROGRAM_ID,
      this.ownerWallet // Include owner wallet if set
    ].filter(Boolean) as PublicKey[];
    
    for (const account of systemAccounts) {
      if (ownerPubkey.equals(account)) {
        return true;
      }
    }
    
    // Check if it's a program account
    try {
      const accountInfo = await this.connection.getAccountInfo(ownerPubkey);
      if (accountInfo && accountInfo.executable) {
        return true;
      }
    } catch {
      // Ignore errors
    }
    
    return false;
  }
  
  /**
   * Distribute rewards to a batch of holders
   */
  private async distributeRewardBatch(
    distributions: Array<{ recipient: PublicKey; amount: number; percentage: number }>,
    rewardToken: PublicKey,
    vaultPda: PublicKey
  ): Promise<string> {
    const tx = new Transaction();
    
    // Get reward token decimals
    const isNativeSol = rewardToken.equals(new PublicKey('So11111111111111111111111111111111111111112'));
    const mintInfo = await getMint(
      this.connection,
      rewardToken,
      'confirmed',
      isNativeSol ? undefined : TOKEN_2022_PROGRAM_ID
    );
    
    const vaultTokenAccount = getAssociatedTokenAddressSync(
      rewardToken,
      vaultPda,
      true,
      isNativeSol ? undefined : TOKEN_2022_PROGRAM_ID
    );
    
    // Add transfer instructions for each recipient
    for (const dist of distributions) {
      const recipientAta = getAssociatedTokenAddressSync(
        rewardToken,
        dist.recipient,
        false,
        isNativeSol ? undefined : TOKEN_2022_PROGRAM_ID
      );
      
      // Check if ATA exists
      const ataInfo = await this.connection.getAccountInfo(recipientAta);
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            this.keeper.publicKey,
            recipientAta,
            dist.recipient,
            rewardToken,
            isNativeSol ? undefined : TOKEN_2022_PROGRAM_ID
          )
        );
      }
      
      // Add transfer instruction
      tx.add(
        createTransferCheckedInstruction(
          vaultTokenAccount,
          rewardToken,
          recipientAta,
          vaultPda,
          dist.amount,
          mintInfo.decimals,
          [],
          isNativeSol ? undefined : TOKEN_2022_PROGRAM_ID
        )
      );
    }
    
    // Add priority fee
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: this.config.jupiter?.priority_fee_lamports || 5000,
      }),
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000 * Math.ceil(distributions.length / 10),
      })
    );
    
    // Send transaction
    const signature = await sendAndConfirmTransaction(
      this.connection,
      tx,
      [this.keeper],
      {
        commitment: 'confirmed',
        skipPreflight: false
      }
    );
    
    return signature;
  }
  
  /**
   * Undistributed balance management
   */
  private ensureDataDirectory() {
    const dataDir = path.dirname(this.undistributedPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }
  
  private loadUndistributed(): UndistributedBalance | null {
    try {
      if (fs.existsSync(this.undistributedPath)) {
        const data = fs.readFileSync(this.undistributedPath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      this.logger.error('Failed to load undistributed balance', error);
    }
    return null;
  }
  
  private saveUndistributed(balance: UndistributedBalance) {
    try {
      fs.writeFileSync(this.undistributedPath, JSON.stringify(balance, null, 2));
      this.logger.info('Saved undistributed balance', balance);
    } catch (error) {
      this.logger.error('Failed to save undistributed balance', error);
    }
  }
  
  private clearUndistributed() {
    try {
      if (fs.existsSync(this.undistributedPath)) {
        fs.unlinkSync(this.undistributedPath);
        this.logger.info('Cleared undistributed balance');
      }
    } catch (error) {
      this.logger.error('Failed to clear undistributed balance', error);
    }
  }
  
  /**
   * Get count of eligible holders
   */
  async getEligibleHolderCount(): Promise<number> {
    const mikoMint = this.configManager.getTokenMint();
    const holders = await this.getEligibleHolders(mikoMint);
    return holders.length;
  }
  
  /**
   * Get undistributed balance info
   */
  getUndistributedInfo(): UndistributedBalance | null {
    return this.loadUndistributed();
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}