// Phase 4-B: Mainnet Fork Configuration

export const MAINNET_FORK_CONFIG = {
  // RPC endpoint for local mainnet fork
  RPC_URL: 'http://127.0.0.1:8899',
  
  // Program IDs (from mainnet)
  programs: {
    raydiumCLMM: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    jupiterV6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    token: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    token2022: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    associatedToken: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  },
  
  // Token mints
  tokens: {
    wsol: 'So11111111111111111111111111111111111111112',
    usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mainnet
    miko: 'EkgPtCLLsbWxhdYrCpqWej2ULoytu6QcygpnyFeiT4Gs', // Phase 4-B MIKO token (current deployment)
  },
  
  // Raydium CLMM pool configuration
  raydium: {
    feeTiers: {
      stable: 1,      // 0.01% - for very stable assets
      standard: 25,   // 0.25% - for most pairs
      volatile: 100,  // 1% - for exotic/volatile pairs
    },
    // We'll use standard fee tier for MIKO/SOL
    mikoSolFeeTier: 25,
  },
  
  // Launch timing configuration (in seconds)
  launch: {
    stages: {
      bootstrap: 0,      // T0: Initial pool creation
      stageA: 60,       // T+60s: Narrow band liquidity
      stageB: 180,      // T+180s: Broader range
      stageC: 300,      // T+300s: Stability backstop
    },
    feeTransitions: {
      first: 300,       // 5 minutes: 30% → 15%
      second: 600,      // 10 minutes: 15% → 5%
    }
  },
  
  // Phase 4-B wallets
  wallets: {
    deployer: 'CDTSFkBB1TuRw7WFZj4ZQpagwBhw5iURjC13kS6hEgSc',
    owner: 'D24rokM1eAxWAU9MQYuXK9QK4jnT1qJ23VP4dCqaw5uh',
    keeper: '6LTnRkPHh27xTgpfkzibe7XcUSGe3kVazvweei1D3syn',
  },
  
  // Our program addresses (deployed to fork)
  mikoPrograms: {
    absoluteVault: '9qPiWoJJdas55cMZqa8d62tVHP9hbYX6NwT34qbHe9pt', // Phase 4-B fork deployment (current)
    smartDial: 'BDYdwfdZF8RAbUokzw1YgNmeRiSGYwNsi8uF7rfsStUe', // Phase 4-B fork deployment (current)
  },
  
  // Harvest threshold
  harvestThreshold: 500_000 * 1e9, // 500k MIKO in smallest units
};