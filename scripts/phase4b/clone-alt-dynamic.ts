import { Connection, PublicKey, AddressLookupTableAccount } from '@solana/web3.js';
import { createLogger } from '../../keeper-bot/src/utils/logger';

const logger = createLogger('ALTCloner');

export class DynamicALTCloner {
  constructor(private connection: Connection) {}

  /**
   * Clone an ALT from mainnet to local fork dynamically
   */
  async cloneALT(altAddress: PublicKey): Promise<void> {
    try {
      logger.info(`Attempting to clone ALT: ${altAddress.toBase58()}`);
      
      // First check if ALT already exists on fork
      const altAccountInfo = await this.connection.getAccountInfo(altAddress);
      if (altAccountInfo) {
        logger.info(`ALT ${altAddress.toBase58()} already exists on fork`);
        return;
      }
      
      // Fetch ALT from mainnet
      const mainnetConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
      const mainnetAltInfo = await mainnetConnection.getAddressLookupTable(altAddress);
      
      if (!mainnetAltInfo || !mainnetAltInfo.value) {
        logger.error(`ALT ${altAddress.toBase58()} not found on mainnet`);
        throw new Error(`ALT not found on mainnet: ${altAddress.toBase58()}`);
      }
      
      logger.info(`ALT found on mainnet with ${mainnetAltInfo.value.state.addresses.length} addresses`);
      
      // Note: Actually cloning an ALT to a local fork requires special RPC methods
      // that aren't available through standard web3.js. We need to use the validator's
      // clone functionality at startup.
      
      logger.warn(`Cannot dynamically clone ALT. It must be cloned when starting the validator.`);
      logger.warn(`Add to start-mainnet-fork.sh: --clone ${altAddress.toBase58()}`);
      
    } catch (error) {
      logger.error(`Failed to clone ALT ${altAddress.toBase58()}:`, error);
      throw error;
    }
  }
  
  /**
   * Extract ALT addresses from a transaction error
   */
  extractALTFromError(error: any): PublicKey | null {
    try {
      const errorStr = error.toString();
      
      // Look for patterns that indicate missing ALT
      if (errorStr.includes('address table account that doesn\'t exist')) {
        logger.info('Transaction failed due to missing ALT');
        
        // Try to decode the transaction to find ALT addresses
        if (error.logs) {
          for (const log of error.logs) {
            // Look for ALT addresses in logs
            const match = log.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/g);
            if (match) {
              for (const addr of match) {
                try {
                  const pubkey = new PublicKey(addr);
                  // Check if this could be an ALT (not a program ID)
                  if (!this.isKnownProgram(pubkey)) {
                    logger.info(`Potential ALT found: ${addr}`);
                    return pubkey;
                  }
                } catch {}
              }
            }
          }
        }
      }
      
      return null;
    } catch (e) {
      logger.error('Failed to extract ALT from error:', e);
      return null;
    }
  }
  
  /**
   * Check if address is a known program (not an ALT)
   */
  private isKnownProgram(address: PublicKey): boolean {
    const knownPrograms = [
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
      'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
      '11111111111111111111111111111111',
      'ComputeBudget111111111111111111111111111111',
    ];
    
    return knownPrograms.includes(address.toBase58());
  }
  
  /**
   * Get all ALTs that might be needed for Raydium
   */
  async detectRequiredALTs(): Promise<PublicKey[]> {
    // Known Raydium ALTs from various sources
    const knownRaydiumALTs = [
      '2immgwYNHBbyVQKVGCEkgWpi53bLwWNRMB5G2nbgYV17',
      '2XizKJs3tB1AnxVb4jW2fZNS8v8mdXfiDibURAqtvc4D', 
      '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5',
      'BRm9x5p98rGTwyz46j8xuQzGS7qccgkfm5z6jw5Q4qv',
      '5cRjHnvZjH1x9YGiUeeUP22dK4JTbEfJw9haMBB2uwJo',
      'CVBAPcNfpMUVfYSEUgNPAf9ds8aHhhVAcE9N3cMGfBc3',
    ];
    
    return knownRaydiumALTs.map(alt => new PublicKey(alt));
  }
}