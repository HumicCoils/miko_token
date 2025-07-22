import { Connection, PublicKey } from '@solana/web3.js';

/**
 * Identify ALL Address Lookup Tables used by Raydium
 * We need to know these BEFORE starting the fork
 */
async function identifyAllRaydiumALTs() {
  console.log('=== IDENTIFYING ALL RAYDIUM ALTs ===\n');
  
  // 1. Known ALTs from Raydium documentation and SDK
  const knownALTs = [
    // From Raydium V2 SDK
    '2immgwYNHBbyVQKVGCEkgWpi53bLwWNRMB5G2nbgYV17', // Raydium Authority V1
    '2XizKJs3tB1AnxVb4jW2fZNS8v8mdXfiDibURAqtvc4D', // Raydium Authority V2  
    '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5', // Raydium V3
    'BRm9x5p98rGTwyz46j8xuQzGS7qccgkfm5z6jw5Q4qv',  // Additional
    'AcL1Vo8oy1ULiavEcjSUcwfBSForXMudcZvDZy5nzJkU', // Found in our failed tx
    
    // CLMM specific ALTs
    '5cRjHnvZjH1x9YGiUeeUP22dK4JTbEfJw9haMBB2uwJo', // CLMM Authority
    'CVBAPcNfpMUVfYSEUgNPAf9ds8aHhhVAcE9N3cMGfBc3', // CLMM V2
    
    // Common token ALTs
    'GmVdwGmtNbNsF8zfZ6z9rXq2bY2kXddt6dtsXMW3bNrS', // Token accounts
    'E8erPjxvJpvcxBWtfCVLBgcRWGtmBmCTBMZet9tEsnsJ', // Popular tokens
  ];
  
  console.log('Known Raydium ALTs:');
  knownALTs.forEach((alt, i) => {
    console.log(`${i + 1}. ${alt}`);
  });
  
  // 2. Additional ALTs found from Raydium SDK source
  console.log('\nAdditional ALTs from Raydium SDK:');
  const additionalALTs = [
    // Found in SDK source and transactions
    'FyKgn4S4zrJ3aw9FJXwdHShTvJziD5KJVeyZGWhBNQ29',
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
  ];
  
  additionalALTs.forEach(alt => {
    if (!knownALTs.includes(alt)) {
      knownALTs.push(alt);
    }
  });
  
  // 3. Check mainnet for CLMM-specific ALTs
  console.log('\nChecking mainnet for CLMM pool ALTs...');
  const mainnetConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  
  // Get a sample CLMM pool to see what ALTs it uses
  const sampleClmmPool = new PublicKey('YNfG9R9FMLcvr9nn8cTVpPLSBYXpiN3N9x9jGevrUud'); // SOL-USDC CLMM pool
  
  try {
    const poolAccount = await mainnetConnection.getAccountInfo(sampleClmmPool);
    if (poolAccount) {
      console.log('Sample CLMM pool found, checking recent transactions...');
      
      // Get recent transactions for this pool
      const signatures = await mainnetConnection.getSignaturesForAddress(sampleClmmPool, { limit: 5 });
      
      for (const sig of signatures) {
        const tx = await mainnetConnection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0
        });
        
        if (tx?.version === 0 && tx?.meta?.loadedAddresses) {
          const loadedAddresses = tx.meta.loadedAddresses as any;
          if (loadedAddresses.lookupTableAddresses) {
            console.log(`\nTransaction ${sig.signature} uses ALTs:`);
            loadedAddresses.lookupTableAddresses.forEach((alt: PublicKey) => {
              console.log(`- ${alt.toBase58()}`);
              if (!knownALTs.includes(alt.toBase58())) {
                knownALTs.push(alt.toBase58());
              }
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking mainnet:', error);
  }
  
  // 4. Output final list for start-mainnet-fork.sh
  console.log('\n=== COMPLETE ALT LIST FOR MAINNET FORK ===');
  console.log('\nAdd these to start-mainnet-fork.sh:');
  
  const uniqueALTs = [...new Set(knownALTs)];
  uniqueALTs.forEach((alt, i) => {
    console.log(`RAYDIUM_ALT_${i + 1}="${alt}"`);
  });
  
  console.log('\nClone commands:');
  uniqueALTs.forEach((alt, i) => {
    console.log(`  --clone $RAYDIUM_ALT_${i + 1} \\`);
  });
  
  return uniqueALTs;
}

identifyAllRaydiumALTs().catch(console.error);