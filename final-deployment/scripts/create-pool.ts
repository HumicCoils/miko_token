import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction
} from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getMint,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createSyncNativeInstruction
} from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { getConfigManager } from './config-manager';
import { Raydium, TxVersion } from '@raydium-io/raydium-sdk-v2';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Raydium CPMM Program ID
const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');

// Bootstrap stage parameters from LAUNCH_LIQUIDITY_PARAMS.md
const BOOTSTRAP_MIKO_SEND = 47_370_000; // 47.37M MIKO to send (includes 5% tax)
const BOOTSTRAP_MIKO_POOL = 45_000_000; // 45M MIKO arrives in pool after 5% tax
const BOOTSTRAP_SOL_AMOUNT_TEST = 0.5; // 0.5 SOL for test
const BOOTSTRAP_SOL_AMOUNT_CANARY = 0.05; // 0.05 SOL for canary  
const BOOTSTRAP_SOL_AMOUNT_PROD = 0.5; // 0.5 SOL for production

interface OraclePrice {
  price: number;
  timestamp: Date;
  source: string;
}

/**
 * Fetch SOL price from oracle
 */
async function fetchSolPrice(network: string): Promise<OraclePrice> {
  if (network === 'localnet' || network === 'devnet') {
    // Fixed price for test environments
    return {
      price: 190,
      timestamp: new Date(),
      source: 'test-fixed'
    };
  }
  
  // Production oracle integration - Pyth Network
  try {
    const pythClient = new PriceServiceConnection(
      'https://hermes.pyth.network',
      { priceFeedRequestConfig: { binary: true } }
    );
    
    // SOL/USD price feed ID
    const solUsdFeedId = 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG';
    
    const priceFeeds = await pythClient.getLatestPriceFeeds([solUsdFeedId]);
    if (!priceFeeds || priceFeeds.length === 0) {
      throw new Error('Failed to fetch price feeds');
    }
    const solPrice = priceFeeds[0].getPriceUnchecked();
    
    return {
      price: Number(solPrice.price) * Math.pow(10, Number(solPrice.expo)),
      timestamp: new Date(Number(solPrice.publishTime) * 1000),
      source: 'pyth'
    };
  } catch (error) {
    throw new Error(`Failed to fetch SOL price: ${error}`);
  }
}

/**
 * Create Raydium CPMM pool for MIKO/SOL
 */
async function createPool() {
  console.log('=== Create MIKO/SOL Pool (Bootstrap Stage) ===\n');
  
  const configManager = getConfigManager();
  const connection = configManager.getConnection();
  const network = configManager.getNetwork();
  
  console.log(`Network: ${network.toUpperCase()}`);
  console.log(`RPC: ${configManager.getRpcUrl()}\n`);
  
  // Load keypairs
  const deployer = configManager.loadKeypair('deployer');
  const tokenMint = configManager.getTokenMint();
  const vaultProgramId = configManager.getVaultProgramId();
  const vaultPda = configManager.getVaultPda();
  
  console.log('Deployer:', deployer.publicKey.toBase58());
  console.log('Token Mint:', tokenMint.toBase58());
  console.log('Vault PDA:', vaultPda.toBase58());
  
  // Check deployment state
  const deploymentState = configManager.getDeploymentState();
  if (!deploymentState.authorities_transferred) {
    throw new Error('Authorities must be transferred before creating pool!');
  }
  
  if (deploymentState.pool_created) {
    console.log('\n✅ Pool already created!');
    console.log('Pool ID:', deploymentState.pool_id);
    return { alreadyCreated: true, poolId: deploymentState.pool_id };
  }
  
  // Fetch SOL price (required before pool creation)
  console.log('\nFetching SOL price from oracle...');
  let oraclePrice: OraclePrice;
  let retryCount = 0;
  const maxRetries = 3;
  
  while (retryCount < maxRetries) {
    try {
      oraclePrice = await fetchSolPrice(network);
      console.log(`✅ SOL Price: $${oraclePrice.price.toFixed(2)}`);
      console.log(`Source: ${oraclePrice.source}`);
      console.log(`Timestamp: ${oraclePrice.timestamp.toISOString()}`);
      break;
    } catch (error) {
      retryCount++;
      console.log(`❌ Oracle fetch attempt ${retryCount}/${maxRetries} failed`);
      if (retryCount >= maxRetries) {
        throw new Error('Failed to fetch SOL price after max retries. Cannot proceed with pool creation.');
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Get SOL (native) mint
  const solMint = new PublicKey('So11111111111111111111111111111111111111112');
  
  // Get mint info
  const mintInfo = await getMint(
    connection,
    tokenMint,
    configManager.getCommitment(),
    TOKEN_2022_PROGRAM_ID
  );
  
  const mikoDecimals = mintInfo.decimals;
  const solDecimals = 9; // SOL always has 9 decimals
  
  // Determine SOL amount based on network
  let solAmountRaw: number;
  if (network === 'mainnet') {
    const isCanary = process.env.CANARY_DEPLOYMENT === 'true';
    solAmountRaw = isCanary ? BOOTSTRAP_SOL_AMOUNT_CANARY : BOOTSTRAP_SOL_AMOUNT_PROD;
  } else {
    solAmountRaw = BOOTSTRAP_SOL_AMOUNT_TEST;
  }
  
  // Calculate actual amounts with decimals
  const mikoAmount = new BN(BOOTSTRAP_MIKO_SEND).mul(new BN(10 ** mikoDecimals));
  const solAmount = new BN(solAmountRaw * LAMPORTS_PER_SOL);
  
  // Calculate initial price (based on what arrives in pool after 5% fee)
  const initialPricePerMiko = solAmountRaw / BOOTSTRAP_MIKO_POOL;
  const initialPricePerMillionMiko = initialPricePerMiko * 1_000_000;
  const initialFdv = oraclePrice!.price * solAmountRaw * (1_000_000_000 / BOOTSTRAP_MIKO_POOL);
  
  console.log('\nPool Parameters (Bootstrap Stage):');
  console.log(`- MIKO Send Amount: ${BOOTSTRAP_MIKO_SEND.toLocaleString()} MIKO (includes 5% tax)`);
  console.log(`- MIKO in Pool: ${BOOTSTRAP_MIKO_POOL.toLocaleString()} MIKO (4.5% of supply)`);
  console.log(`- SOL Amount: ${solAmountRaw} SOL`);
  console.log(`- Initial Price: ${initialPricePerMillionMiko.toFixed(8)} SOL per 1M MIKO`);
  console.log(`- Initial Price: $${(initialPricePerMillionMiko * oraclePrice!.price).toFixed(4)} per 1M MIKO`);
  console.log(`- Initial FDV: $${initialFdv.toLocaleString()}`);
  console.log(`- Transfer Fee: 5% (applies to all MIKO transfers)`);
  
  // Get deployer token accounts
  const deployerMikoAta = getAssociatedTokenAddressSync(
    tokenMint,
    deployer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  // Check MIKO balance
  console.log('\nChecking balances...');
  try {
    const mikoAccount = await getAccount(
      connection,
      deployerMikoAta,
      configManager.getCommitment(),
      TOKEN_2022_PROGRAM_ID
    );
    const mikoBalance = Number(mikoAccount.amount) / (10 ** mikoDecimals);
    console.log('MIKO Balance:', mikoBalance.toLocaleString(), 'MIKO');
    
    // Check if we have enough MIKO to send (already includes 5% tax)
    if (mikoBalance < BOOTSTRAP_MIKO_SEND) {
      throw new Error(`Insufficient MIKO balance! Need ${BOOTSTRAP_MIKO_SEND.toLocaleString()} MIKO to send`);
    }
  } catch (error) {
    throw new Error('Deployer MIKO ATA not found. Run create-token.ts first!');
  }
  
  // Check SOL balance
  const solBalance = await connection.getBalance(deployer.publicKey);
  console.log('SOL Balance:', solBalance / LAMPORTS_PER_SOL, 'SOL');
  
  if (solBalance < solAmount.toNumber() + 0.1 * LAMPORTS_PER_SOL) {
    throw new Error('Insufficient SOL balance for pool creation!');
  }
  
  // Initialize Raydium SDK
  console.log('\nInitializing Raydium SDK...');
  const raydium = await Raydium.load({
    connection,
    owner: deployer,
    cluster: network === 'mainnet' ? 'mainnet' : 'devnet',
    disableFeatureCheck: true,
    disableLoadToken: false,
    blockhashCommitment: configManager.getCommitment(),
  });
  
  // Get token info
  console.log('\nFetching token info...');
  const [tokenInfoA, tokenInfoB] = await Promise.all([
    raydium.token.getTokenInfo(tokenMint.toBase58()),
    raydium.token.getTokenInfo(solMint.toBase58()),
  ]);
  
  // CPMM pool creation fee receiver (mainnet)
  const poolFeeAccount = new PublicKey('DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8');
  
  // Get CPMM fee config (0.25% tier)
  let feeConfig;
  try {
    const feeConfigs = await raydium.api.getCpmmConfigs();
    feeConfig = feeConfigs.find((c: any) => c.tradeFeeRate === 2500) || feeConfigs[0];
  } catch (error) {
    console.warn('Failed to fetch CPMM configs, using default');
    feeConfig = {
      id: '2jGmCcmxvKzCz1gG3xV1eVmUQMdhVfn3cVyv7KHRe3Qw',
      index: 0,
      protocolFeeRate: 120000,
      tradeFeeRate: 2500, // 0.25%
      fundFeeRate: 25000,
      createPoolFee: '0.15',
    };
  }
  
  // Create pool
  console.log('\nCreating CPMM pool...');
  const { execute, extInfo } = await raydium.cpmm.createPool({
    programId: RAYDIUM_CPMM_PROGRAM_ID,
    poolFeeAccount: poolFeeAccount,
    mintA: tokenInfoA,
    mintB: tokenInfoB,
    mintAAmount: mikoAmount,
    mintBAmount: solAmount,
    startTime: new BN(0), // Start immediately
    feeConfig: feeConfig,
    associatedOnly: true,
    ownerInfo: {
      useSOLBalance: true,
    },
    txVersion: TxVersion.V0,
    computeBudgetConfig: {
      units: 600000,
      microLamports: 10000,
    },
  });
  
  // Execute transaction
  console.log('\nSending transaction...');
  const { txId } = await execute({ sendAndConfirm: true });
  
  const poolId = extInfo.address.poolId;
  console.log('\nPool ID:', poolId.toBase58());
  const sig = txId;
  
  console.log('\n✅ Pool created successfully!');
  console.log('Signature:', sig);
  console.log('Pool ID:', poolId.toBase58());
  
  // Set launch time in vault
  console.log('\nSetting launch time in vault...');
  await setLaunchTime(connection, vaultProgramId, vaultPda, deployer, configManager);
  
  // Update vault program with pool registry
  console.log('\nUpdating pool registry...');
  await updatePoolRegistry(
    connection,
    vaultProgramId,
    vaultPda,
    poolId,
    configManager
  );
  
  // Save pool info with vault addresses
  const poolInfo = {
    poolId: poolId.toBase58(),
    mintA: tokenMint.toBase58(),
    mintB: solMint.toBase58(),
    vaultA: extInfo.address.vaultA.toBase58(),
    vaultB: extInfo.address.vaultB.toBase58(),
    feeRate: 0.0025, // 0.25%
    createdAt: new Date().toISOString(),
    signature: sig,
    bootstrapStage: {
      mikoSent: BOOTSTRAP_MIKO_SEND,
      mikoInPool: BOOTSTRAP_MIKO_POOL,
      solAmount: solAmountRaw,
      solPrice: oraclePrice!.price,
      initialPricePerMiko: initialPricePerMiko,
      initialFdv: initialFdv,
      txSig: sig,
      timestamp: new Date().toISOString()
    }
  };
  
  // Update deployment state
  configManager.updateDeploymentState({
    pool_created: true,
    pool_id: poolId.toBase58(),
    pool_info: poolInfo,
    launch_time: new Date().toISOString()
  });
  
  console.log('\n📊 Bootstrap Stage Summary:');
  console.log(`- MIKO Sent: ${BOOTSTRAP_MIKO_SEND.toLocaleString()} (includes 5% tax)`);
  console.log(`- MIKO in Pool: ${BOOTSTRAP_MIKO_POOL.toLocaleString()} (4.5% of supply)`);
  console.log(`- SOL Added: ${solAmountRaw}`);
  console.log(`- Initial Price: ${initialPricePerMillionMiko.toFixed(8)} SOL per 1M MIKO`);
  console.log(`- Initial FDV: $${initialFdv.toLocaleString()}`);
  console.log(`- Pool Fee Rate: 0.25%`);
  console.log(`- Transfer Fee: 5% applied automatically`);
  console.log('\n✅ Pool is now live for trading!');
  console.log('\n⏱️  Next liquidity stages:');
  console.log('- Stage A: +60s (225M MIKO + ' + 
    (network === 'mainnet' && process.env.CANARY_DEPLOYMENT === 'true' ? '0.25' : '2.5') + ' SOL)');
  console.log('- Stage B: +180s (270M MIKO + ' + 
    (network === 'mainnet' && process.env.CANARY_DEPLOYMENT === 'true' ? '0.3' : '3.0') + ' SOL)');
  console.log('- Stage C: +300s (360M MIKO + ' + 
    (network === 'mainnet' && process.env.CANARY_DEPLOYMENT === 'true' ? '0.4' : '4.0') + ' SOL)');
  console.log('\nRun: npm run add-liquidity');
  
  return {
    success: true,
    poolId: poolId.toBase58(),
    signature: sig,
    oraclePrice: oraclePrice!.price,
    launchTime: new Date()
  };
}

/**
 * Set launch time in vault
 */
async function setLaunchTime(
  connection: Connection,
  vaultProgramId: PublicKey,
  vaultPda: PublicKey,
  deployer: Keypair,
  configManager: any
) {
  try {
    const provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(deployer),
      { commitment: configManager.getCommitment() }
    );
    
    // Load IDL from local file
    const idlPath = path.join(__dirname, '..', 'idl', 'absolute_vault.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    idl.address = vaultProgramId.toBase58();
    const program = new anchor.Program(idl, provider);
    
    const tx = await program.methods
      .setLaunchTime()
      .accounts({
        vault: vaultPda,
      })
      .rpc();
    
    console.log('✅ Launch time set in vault!');
    console.log('Signature:', tx);
  } catch (error: any) {
    if (error.message?.includes('LaunchTimeAlreadySet')) {
      console.log('⚠️  Launch time already set');
    } else {
      console.log('⚠️  Failed to set launch time:', error);
    }
  }
}

/**
 * Update vault program's pool registry
 */
async function updatePoolRegistry(
  connection: Connection,
  vaultProgramId: PublicKey,
  vaultPda: PublicKey,
  poolId: PublicKey,
  configManager: any
) {
  try {
    const keeper = configManager.loadKeypair('keeper');
    const provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(keeper),
      { commitment: configManager.getCommitment() }
    );
    
    // Load IDL from local file
    const idlPath = path.join(__dirname, '..', 'idl', 'absolute_vault.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    idl.address = vaultProgramId.toBase58();
    const program = new anchor.Program(idl, provider);
    
    const poolRegistryPda = configManager.getPoolRegistryPda();
    
    const tx = await program.methods
      .updatePoolRegistry([poolId])
      .accounts({
        poolRegistry: poolRegistryPda,
        vault: vaultPda,
        keeperAuthority: keeper.publicKey,
      })
      .signers([keeper])
      .rpc();
    
    console.log('✅ Pool registry updated!');
    console.log('Signature:', tx);
  } catch (error) {
    console.log('⚠️  Pool registry update failed (may require manual update):', error);
  }
}

// Import Pyth client
import { PriceServiceConnection } from '@pythnetwork/price-service-client';
import { withdrawPoolFees } from './withdraw-pool-fees';

// Run if called directly
if (require.main === module) {
  createPool()
    .then(async () => {
      console.log('\n=== Recovering Initial Pool Fees ===');
      console.log('Withdrawing withheld fees from pool creation...\n');
      
      try {
        await withdrawPoolFees();
        console.log('✅ Initial fees recovered successfully!');
      } catch (error) {
        console.log('⚠️  Failed to recover initial fees:', error);
      }
      
      console.log('\n✅ Pool creation complete!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Error:', err);
      process.exit(1);
    });
}

export { createPool };