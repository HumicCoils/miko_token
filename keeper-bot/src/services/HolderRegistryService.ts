import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { logger } from '../utils/logger';
import { config } from '../config';
import { BirdeyeClient } from '../clients/BirdeyeClient';

interface Holder {
  address: PublicKey;
  balance: number;
  usdValue: number;
}

export class HolderRegistryService {
  private connection: Connection;
  private provider: AnchorProvider;
  private absoluteVaultProgram: Program;
  private birdeyeClient: BirdeyeClient;
  private keeperWallet: Keypair;

  constructor(
    connection: Connection,
    keeperWallet: Keypair,
    absoluteVaultProgram: Program,
    birdeyeClient: BirdeyeClient
  ) {
    this.connection = connection;
    this.keeperWallet = keeperWallet;
    this.provider = new AnchorProvider(
      connection,
      new Wallet(keeperWallet),
      { commitment: 'confirmed' }
    );
    this.absoluteVaultProgram = absoluteVaultProgram;
    this.birdeyeClient = birdeyeClient;
  }

  /**
   * Update holder registry with current eligible holders
   */
  async updateHolderRegistry(): Promise<void> {
    try {
      logger.info('Updating holder registry...');
      
      // Get all MIKO holders
      const allHolders = await this.fetchAllHolders();
      
      // Get current MIKO price
      const mikoPrice = await this.birdeyeClient.getTokenPrice(config.MIKO_TOKEN_MINT);
      
      // Filter eligible holders ($100+ USD value)
      const eligibleHolders = allHolders.filter(holder => {
        holder.usdValue = (holder.balance / 1e9) * mikoPrice;
        return holder.usdValue >= config.HOLDER_VALUE_THRESHOLD && 
               !this.isExcludedWallet(holder.address);
      });

      logger.info(`Found ${eligibleHolders.length} eligible holders out of ${allHolders.length} total`);

      // Update on-chain registry
      await this.updateOnChainRegistry(eligibleHolders);
    } catch (error) {
      logger.error('Failed to update holder registry:', error);
      throw error;
    }
  }

  /**
   * Get current eligible holders from registry
   */
  async getEligibleHolders(): Promise<Holder[]> {
    try {
      const holders: Holder[] = [];
      let chunkId = 0;
      
      while (true) {
        try {
          const [registryPda] = await PublicKey.findProgramAddress(
            [Buffer.from('holder_registry'), Buffer.from([chunkId])],
            this.absoluteVaultProgram.programId
          );
          
          const registry = await this.absoluteVaultProgram.account.holderRegistry.fetch(registryPda);
          
          for (let i = 0; i < registry.count; i++) {
            holders.push({
              address: registry.holders[i],
              balance: registry.balances[i].toNumber(),
              usdValue: 0, // Will be calculated if needed
            });
          }
          
          chunkId++;
        } catch {
          // No more chunks
          break;
        }
      }
      
      return holders;
    } catch (error) {
      logger.error('Failed to get eligible holders:', error);
      throw error;
    }
  }

  /**
   * Fetch all MIKO token holders
   */
  private async fetchAllHolders(): Promise<Holder[]> {
    try {
      const tokenAccounts = await this.connection.getProgramAccounts(
        TOKEN_PROGRAM_ID,
        {
          filters: [
            { dataSize: 165 },
            {
              memcmp: {
                offset: 0,
                bytes: config.MIKO_TOKEN_MINT,
              },
            },
          ],
        }
      );

      const holders: Holder[] = [];
      
      for (const account of tokenAccounts) {
        const data = await this.connection.getAccountInfo(account.pubkey);
        if (!data) continue;

        const balance = this.parseTokenAccountBalance(data.data);
        if (balance === 0) continue;

        const owner = new PublicKey(data.data.slice(32, 64));
        
        holders.push({
          address: owner,
          balance: balance,
          usdValue: 0, // Calculated later
        });
      }

      return holders.sort((a, b) => b.balance - a.balance);
    } catch (error) {
      logger.error('Failed to fetch holders:', error);
      throw error;
    }
  }

  /**
   * Check if wallet is excluded (exchange, program, etc.)
   */
  private async isExcludedWallet(address: PublicKey): Promise<boolean> {
    try {
      // Check on-chain exclusion list
      const [exclusionPda] = await PublicKey.findProgramAddress(
        [Buffer.from('exclusions')],
        this.absoluteVaultProgram.programId
      );

      const exclusions = await this.absoluteVaultProgram.account.rewardExclusions.fetch(exclusionPda);
      
      if (exclusions.excludedAddresses.some(addr => addr.equals(address))) {
        return true;
      }

      // Check if it's a program account
      const accountInfo = await this.connection.getAccountInfo(address);
      if (accountInfo && accountInfo.executable) {
        return true;
      }

      // Check against hardcoded exclusion list
      const knownExclusions = [
        config.TREASURY_WALLET,
        config.ABSOLUTE_VAULT_PROGRAM,
        config.SMART_DIAL_PROGRAM,
        config.MIKO_TRANSFER_PROGRAM,
        // Add known exchange wallets here
      ];

      return knownExclusions.some(excluded => 
        new PublicKey(excluded).equals(address)
      );
    } catch (error) {
      logger.warn(`Error checking exclusion for ${address.toBase58()}:`, error);
      return false;
    }
  }

  /**
   * Update on-chain holder registry
   */
  private async updateOnChainRegistry(holders: Holder[]): Promise<void> {
    const chunks = this.chunkArray(holders, 100);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      const tx = await this.absoluteVaultProgram.methods
        .updateHolderRegistry(
          i,
          i * 100,
          chunk.length,
          BigInt(config.HOLDER_VALUE_THRESHOLD * 1e9)
        )
        .accounts({
          authority: this.keeperWallet.publicKey,
          // ... other accounts
        })
        .rpc();

      logger.info(`Updated registry chunk ${i}: ${tx}`);
    }
  }

  /**
   * Parse token account balance
   */
  private parseTokenAccountBalance(data: Buffer): number {
    return Number(data.readBigUInt64LE(64));
  }

  /**
   * Chunk array helper
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}