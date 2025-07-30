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
import { Raydium, TxVersion, Percent } from '@raydium-io/raydium-sdk-v2';
import Decimal from 'decimal.js';

// Stage parameters from LAUNCH_LIQUIDITY_PARAMS.md
interface LiquidityStage {
  name: string;
  offsetSeconds: number;
  mikoAmount: number; // in millions
  solAmountTest: number;
  solAmountCanary: number;
  solAmountProd: number;
  percentOfSupply: number;
}

const LIQUIDITY_STAGES: LiquidityStage[] = [
  {
    name: 'A',
    offsetSeconds: 60,
    mikoAmount: 225, // 225M MIKO
    solAmountTest: 2.5,
    solAmountCanary: 0.25,
    solAmountProd: 2.5,
    percentOfSupply: 22.5
  },
  {
    name: 'B',
    offsetSeconds: 180,
    mikoAmount: 270, // 270M MIKO
    solAmountTest: 3.0,
    solAmountCanary: 0.3,
    solAmountProd: 3.0,
    percentOfSupply: 27
  },
  {
    name: 'C',
    offsetSeconds: 300,
    mikoAmount: 360, // 360M MIKO
    solAmountTest: 4.0,
    solAmountCanary: 0.4,
    solAmountProd: 4.0,
    percentOfSupply: 36
  }
];

// Slippage tolerance (1%)
const SLIPPAGE_TOLERANCE = 0.01;

/**
 * Add liquidity in stages A, B, C
 */
async function addLiquidity() {
  console.log('=== Add Liquidity (Stages A, B, C) ===\n');
  
  const configManager = getConfigManager();
  const connection = configManager.getConnection();
  const network = configManager.getNetwork();
  
  console.log(`Network: ${network.toUpperCase()}`);
  console.log(`RPC: ${configManager.getRpcUrl()}\n`);
  
  // Load keypairs and state
  const deployer = configManager.loadKeypair('deployer');
  const tokenMint = configManager.getTokenMint();
  const deploymentState = configManager.getDeploymentState();
  
  if (!deploymentState.pool_created || !deploymentState.pool_id) {
    throw new Error('Pool must be created first! Run create-pool.ts');
  }
  
  const poolId = new PublicKey(deploymentState.pool_id);
  const launchTime = new Date(deploymentState.launch_time || new Date());
  
  console.log('Deployer:', deployer.publicKey.toBase58());
  console.log('Pool ID:', poolId.toBase58());
  console.log('Launch Time:', launchTime.toISOString());
  
  // Get SOL mint
  const solMint = new PublicKey('So11111111111111111111111111111111111111112');
  
  // Get mint info
  const mintInfo = await getMint(
    connection,
    tokenMint,
    configManager.getCommitment(),
    TOKEN_2022_PROGRAM_ID
  );
  
  const mikoDecimals = mintInfo.decimals;
  const solDecimals = 9;
  
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
  
  // Get pool info
  const poolInfo = await raydium.cpmm.getPoolInfoFromRpc(poolId.toBase58());
  if (!poolInfo) {
    throw new Error('Pool not found!');
  }
  
  // Check current liquidity state
  const liquidityState = deploymentState.liquidity_stages || {};
  const completedStages = Object.keys(liquidityState).filter(
    stage => liquidityState[stage]?.completed
  );
  
  console.log('\nLiquidity Stage Status:');
  console.log('- Bootstrap: ✅ (completed at pool creation)');
  for (const stage of LIQUIDITY_STAGES) {
    const status = liquidityState[stage.name]?.completed ? '✅' : '⏳';
    console.log(`- Stage ${stage.name}: ${status}`);
  }
  
  // Execute remaining stages
  for (const stage of LIQUIDITY_STAGES) {
    if (liquidityState[stage.name]?.completed) {
      console.log(`\nStage ${stage.name} already completed, skipping...`);
      continue;
    }
    
    // Calculate time to wait
    const currentTime = new Date();
    const targetTime = new Date(launchTime.getTime() + stage.offsetSeconds * 1000);
    const waitTime = targetTime.getTime() - currentTime.getTime();
    
    if (waitTime > 0) {
      console.log(`\n⏱️  Waiting ${Math.ceil(waitTime / 1000)}s for Stage ${stage.name} (+${stage.offsetSeconds}s)...`);
      
      // Show countdown
      const totalSeconds = Math.ceil(waitTime / 1000);
      for (let i = totalSeconds; i > 0; i--) {
        process.stdout.write(`\r${i}s remaining...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      console.log('\r✅ Time reached!');
    }
    
    // Execute stage
    console.log(`\n=== Executing Stage ${stage.name} ===`);
    console.log(`Target: +${stage.offsetSeconds}s from launch`);
    
    try {
      const result = await executeStage(
        stage,
        connection,
        deployer,
        poolId,
        poolInfo,
        tokenMint,
        solMint,
        network,
        configManager,
        raydium
      );
      
      // Update deployment state
      const updatedLiquidityState = {
        ...liquidityState,
        [stage.name]: {
          completed: true,
          ...result
        }
      };
      
      configManager.updateDeploymentState({
        liquidity_stages: updatedLiquidityState
      });
      
      console.log(`✅ Stage ${stage.name} completed!`);
      console.log(`Signature: ${result.signature}`);
      
    } catch (error) {
      console.error(`\n❌ Stage ${stage.name} failed:`, error);
      throw error;
    }
  }
  
  // Mark liquidity as fully added
  configManager.updateDeploymentState({
    liquidity_added: true,
    liquidity_completion_time: new Date().toISOString()
  });
  
  console.log('\n🎉 All liquidity stages completed!');
  console.log('\n📊 Final Liquidity Summary:');
  console.log('- Bootstrap: 45M MIKO (4.5%)');
  console.log('- Stage A: 225M MIKO (22.5%)');
  console.log('- Stage B: 270M MIKO (27%)');
  console.log('- Stage C: 360M MIKO (36%)');
  console.log('- Total: 900M MIKO (90% of supply)');
  console.log('\n✅ Pool is fully funded and ready!');
  console.log('\nNext step: Revoke mint authority (npm run revoke-mint)');
}

/**
 * Execute a single liquidity stage
 */
async function executeStage(
  stage: LiquidityStage,
  connection: Connection,
  deployer: Keypair,
  poolId: PublicKey,
  initialPoolInfo: any,
  tokenMint: PublicKey,
  solMint: PublicKey,
  network: string,
  configManager: any,
  raydium: Raydium
): Promise<any> {
  // Determine SOL amount based on network
  let solAmountRaw: number;
  if (network === 'mainnet') {
    const isCanary = process.env.CANARY_DEPLOYMENT === 'true';
    solAmountRaw = isCanary ? stage.solAmountCanary : stage.solAmountProd;
  } else {
    solAmountRaw = stage.solAmountTest;
  }
  
  // Get decimals
  const mintInfo = await getMint(
    connection,
    tokenMint,
    configManager.getCommitment(),
    TOKEN_2022_PROGRAM_ID
  );
  const mikoDecimals = mintInfo.decimals;
  
  // Calculate amounts using Decimal for precision
  const mikoAmount = new BN(
    new Decimal(stage.mikoAmount)
      .mul(1_000_000) // Convert millions to base
      .mul(10 ** mikoDecimals) // Apply decimals
      .toFixed(0)
  );
  const solAmount = new BN(
    new Decimal(solAmountRaw)
      .mul(LAMPORTS_PER_SOL)
      .toFixed(0)
  );
  
  console.log(`\nStage ${stage.name} Parameters:`);
  console.log(`- MIKO Amount: ${stage.mikoAmount}M (${stage.percentOfSupply}% of supply)`);
  console.log(`- SOL Amount: ${solAmountRaw} SOL`);
  console.log(`- 5% Transfer Fee: Will be applied automatically`);
  
  // Get fresh pool info from RPC
  console.log('\nFetching current pool info...');
  const poolInfo = await raydium.cpmm.getPoolInfoFromRpc(poolId.toBase58());
  if (!poolInfo) {
    throw new Error('Pool not found!');
  }
  
  // Get current reserves from pool info
  const poolKeys = poolInfo.poolKeys;
  const poolVaultA = await connection.getTokenAccountBalance(new PublicKey(poolKeys.vault.A));
  const poolVaultB = await connection.getTokenAccountBalance(new PublicKey(poolKeys.vault.B));
  
  const currentMikoReserve = new Decimal(poolVaultA.value.amount);
  const currentSolReserve = new Decimal(poolVaultB.value.amount);
  
  // Calculate price impact and slippage
  const currentPrice = currentSolReserve.div(currentMikoReserve);
  const newMikoReserve = currentMikoReserve.add(mikoAmount.toString());
  const newSolReserve = currentSolReserve.add(solAmount.toString());
  const newPrice = newSolReserve.div(newMikoReserve);
  
  const priceImpact = newPrice.sub(currentPrice).div(currentPrice).abs();
  console.log(`Price Impact: ${priceImpact.mul(100).toFixed(4)}%`);
  
  // Create slippage percent
  const slippagePercent = new Percent(SLIPPAGE_TOLERANCE * 100, 100); // 1% = Percent(1, 100)
  console.log(`Using slippage tolerance: ${SLIPPAGE_TOLERANCE * 100}%`);
  
  // Check balances
  const deployerMikoAta = getAssociatedTokenAddressSync(
    tokenMint,
    deployer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  const mikoAccount = await getAccount(
    connection,
    deployerMikoAta,
    configManager.getCommitment(),
    TOKEN_2022_PROGRAM_ID
  );
  const mikoBalance = Number(mikoAccount.amount) / (10 ** mikoDecimals);
  
  // Account for 5% transfer fee
  const requiredMikoWithFee = stage.mikoAmount * 1_000_000 * 1.05263; // 1 / 0.95 ≈ 1.05263
  if (mikoBalance < requiredMikoWithFee) {
    throw new Error(`Insufficient MIKO balance! Need ${requiredMikoWithFee.toLocaleString()} MIKO (including 5% fee)`);
  }
  
  const solBalance = await connection.getBalance(deployer.publicKey);
  if (solBalance < solAmount.toNumber() + 0.1 * LAMPORTS_PER_SOL) {
    throw new Error('Insufficient SOL balance!');
  }
  
  console.log('\nBalances OK ✅');
  
  // Add liquidity using Raydium SDK
  console.log(`\nAdding liquidity for Stage ${stage.name}...`);
  
  // Determine which mint is MIKO (A or B)
  const isMikoMintA = poolInfo.poolKeys.mintA.address === tokenMint.toBase58();
  console.log(`MIKO is mint ${isMikoMintA ? 'A' : 'B'}`);
  
  const { execute } = await raydium.cpmm.addLiquidity({
    poolInfo: poolInfo.poolInfo,
    poolKeys: poolInfo.poolKeys,
    inputAmount: mikoAmount,
    slippage: slippagePercent,
    baseIn: isMikoMintA, // true if MIKO is mintA
    txVersion: TxVersion.V0,
  });
  
  // Execute transaction
  console.log('Sending transaction...');
  const { txId } = await execute({ sendAndConfirm: true });
  const sig = txId;
  
  // Get transaction details (with version 0 support)
  let txDetails;
  try {
    txDetails = await connection.getTransaction(sig, {
      commitment: configManager.getCommitment(),
      maxSupportedTransactionVersion: 0
    });
  } catch (error) {
    console.log('Transaction submitted successfully, but details unavailable');
    txDetails = null;
  }
  
  return {
    completed: true,
    signature: sig,
    slot: txDetails?.slot,
    timestamp: new Date().toISOString(),
    mikoAmount: stage.mikoAmount * 1_000_000,
    solAmount: solAmountRaw,
    executedAt: `+${stage.offsetSeconds}s`,
    priceImpact: priceImpact.toNumber(),
    slippageTolerance: SLIPPAGE_TOLERANCE
  };
}

// Run if called directly
if (require.main === module) {
  addLiquidity()
    .then(() => {
      console.log('\n✅ Success!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Error:', err);
      process.exit(1);
    });
}

export { addLiquidity };