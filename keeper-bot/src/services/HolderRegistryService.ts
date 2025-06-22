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
   * Fetch all MIKO token holders
   */
  async fetchAllHolders(): Promise<Holder[]> {
    try {
      logger.info('Fetching all MIKO token holders...');
      
      // Get all token accounts for MIKO
      const tokenAccounts = await this.connection.getProgramAccounts(
        TOKEN_PROGRAM_ID,
        {
          filters: [
            {
              dataSize: 165, // Token account size
            },
            {
              memcmp: {
                offset: 0, // Mint address offset
                bytes: config.MIKO_TOKEN_MINT,
              },
            },
          ],
        }
      );

      // Get MIKO price from Birdeye
      const mikoPrice = await this.birdeyeClient.getTokenPrice(config.MIKO_TOKEN_MINT);
      
      const holders: Holder[] = [];
      
      for (const account of tokenAccounts) {
        const data = await this.connection.getAccountInfo(account.pubkey);
        if (!data) continue;

        // Parse token account data
        const balance = this.parseTokenAccountBalance(data.data);
        if (balance === 0) continue;

        const owner = new PublicKey(data.data.slice(32, 64));
        const usdValue = (balance / 1e9) * mikoPrice; // Convert from lamports

        holders.push({
          address: owner,
          balance: balance,
          usdValue: usdValue,
        });
      }

      logger.info(`Found ${holders.length} MIKO holders`);
      return holders.sort((a, b) => b.balance - a.balance);
    } catch (error) {
      logger.error('Failed to fetch holders:', error);
      throw error;
    }
  }

  /**
   * Calculate USD value of holder's MIKO balance
   */
  async calculateHolderValue(holder: Holder): Promise<number> {
    try {
      const mikoPrice = await this.birdeyeClient.getTokenPrice(config.MIKO_TOKEN_MINT);
      return (holder.balance / 1e9) * mikoPrice;
    } catch (error) {
      logger.error('Failed to calculate holder value:', error);
      throw error;
    }
  }

  /**
   * Update holder registry on-chain
   */
  async updateHolderRegistry(eligibleHolders: Holder[]): Promise<void> {
    try {
      logger.info(`Updating holder registry with ${eligibleHolders.length} eligible holders`);

      // Filter holders above threshold and not excluded
      const qualifiedHolders = eligibleHolders.filter(holder => 
        holder.usdValue >= config.HOLDER_VALUE_THRESHOLD &&
        !this.isExcludedWallet(holder.address)
      );

      // Split into chunks (max 100 per account)
      const chunks = this.chunkArray(qualifiedHolders, 100);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const holders = chunk.map(h => h.address);
        const balances = chunk.map(h => h.balance);

        const tx = await this.absoluteVaultProgram.methods
          .updateHolderRegistry(
            i,                    // chunk_id
            i * 100,             // start_index
            chunk.length,        // batch_size
            BigInt(config.HOLDER_VALUE_THRESHOLD * 1e9) // min_holder_threshold in lamports
          )
          .accounts({
            authority: this.keeperWallet.publicKey,
            taxConfig: await this.getTaxConfigPda(),
            holderRegistry: await this.getHolderRegistryPda(i),
            systemProgram: PublicKey.default,
          })
          .rpc();

        logger.info(`Updated holder registry chunk ${i}: ${tx}`);
      }

      logger.info('Holder registry update complete');
    } catch (error) {
      logger.error('Failed to update holder registry:', error);
      throw error;
    }
  }

  /**
   * Check if a wallet is excluded (exchange, contract, etc.)
   */
  isExcludedWallet(address: PublicKey): boolean {
    // Check against exclusion list
    const excludedAddresses = [
      // Known exchange wallets
      '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', // Example exchange
      // Add more excluded addresses
    ];

    return excludedAddresses.includes(address.toBase58());
  }

  /**
   * Helper: Parse token account balance from raw data
   */
  private parseTokenAccountBalance(data: Buffer): number {
    // Token amount is stored at offset 64
    return Number(data.readBigUInt64LE(64));
  }

  /**
   * Helper: Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Helper: Get tax config PDA
   */
  private async getTaxConfigPda(): Promise<PublicKey> {
    const [pda] = await PublicKey.findProgramAddress(
      [Buffer.from('tax_config')],
      this.absoluteVaultProgram.programId
    );
    return pda;
  }

  /**
   * Helper: Get holder registry PDA for chunk
   */
  private async getHolderRegistryPda(chunkId: number): Promise<PublicKey> {
    const [pda] = await PublicKey.findProgramAddress(
      [Buffer.from('holder_registry'), Buffer.from([chunkId])],
      this.absoluteVaultProgram.programId
    );
    return pda;
  }
}