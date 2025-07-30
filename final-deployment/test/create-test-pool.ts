import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getMint
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const FORK_RPC = 'http://localhost:8899';

// From LAUNCH_LIQUIDITY_PARAMS.md
const LIQUIDITY_STAGES = {
  bootstrap: { miko: 45_000_000 * 1e9, sol: 0.5 * LAMPORTS_PER_SOL },
  stageA: { miko: 225_000_000 * 1e9, sol: 2.5 * LAMPORTS_PER_SOL },
  stageB: { miko: 270_000_000 * 1e9, sol: 3.0 * LAMPORTS_PER_SOL },
  stageC: { miko: 360_000_000 * 1e9, sol: 4.0 * LAMPORTS_PER_SOL }
};

async function createTestPool() {
  console.log('🏊 Creating MIKO/SOL CPMM Pool with staged liquidity...\n');
  
  const connection = new Connection(FORK_RPC, 'confirmed');
  
  // Load deployment info
  const deploymentPath = path.join(__dirname, '..', 'deployment-addresses.json');
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf-8'));
  
  const mikoMint = new PublicKey(deployment.token.address);
  const vaultPda = new PublicKey(deployment.pdas.vault);
  
  // Load deployer keypair
  const deployerPath = path.join(__dirname, '..', 'keypairs', 'deployer.json');
  const deployer = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(deployerPath, 'utf-8')))
  );
  
  console.log('Deployer:', deployer.publicKey.toBase58());
  console.log('MIKO Mint:', mikoMint.toBase58());
  
  // Get deployer's MIKO balance
  const deployerMikoAta = getAssociatedTokenAddressSync(
    mikoMint,
    deployer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  // Bootstrap: Create pool with initial liquidity
  console.log('📍 T0: Creating pool with bootstrap liquidity...');
  console.log(`   MIKO: ${LIQUIDITY_STAGES.bootstrap.miko / 1e9}`);
  console.log(`   SOL: ${LIQUIDITY_STAGES.bootstrap.sol / LAMPORTS_PER_SOL}`);
  
  const poolCreationTime = Date.now();
  
  // Create Raydium CPMM pool
  // This would use the actual create-pool.ts script
  const createPoolScript = path.join(__dirname, '..', 'scripts', 'create-pool.ts');
  process.env.INITIAL_MIKO_AMOUNT = LIQUIDITY_STAGES.bootstrap.miko.toString();
  process.env.INITIAL_SOL_AMOUNT = LIQUIDITY_STAGES.bootstrap.sol.toString();
  
  const { createRaydiumCpmmPool } = await import(createPoolScript);
  const poolResult = await createRaydiumCpmmPool();
  
  console.log('✅ Pool created:', poolResult.poolId.toBase58());
  
  // Set launch timestamp in vault
  console.log('\n📝 Setting launch timestamp in vault...');
  const { setLaunchTimestamp } = await import('../scripts/set-launch-timestamp');
  await setLaunchTimestamp();
  
  // Stage A: +60s
  console.log('\n⏰ Waiting 60s for Stage A...');
  await waitUntil(poolCreationTime + 60 * 1000);
  
  console.log('📍 Stage A: Adding liquidity...');
  console.log(`   MIKO: ${LIQUIDITY_STAGES.stageA.miko / 1e9}`);
  console.log(`   SOL: ${LIQUIDITY_STAGES.stageA.sol / LAMPORTS_PER_SOL}`);
  
  await addLiquidity(
    connection,
    deployer,
    poolResult.poolId,
    LIQUIDITY_STAGES.stageA.miko,
    LIQUIDITY_STAGES.stageA.sol
  );
  
  // Stage B: +180s
  console.log('\n⏰ Waiting for Stage B (+180s)...');
  await waitUntil(poolCreationTime + 180 * 1000);
  
  console.log('📍 Stage B: Adding liquidity...');
  console.log(`   MIKO: ${LIQUIDITY_STAGES.stageB.miko / 1e9}`);
  console.log(`   SOL: ${LIQUIDITY_STAGES.stageB.sol / LAMPORTS_PER_SOL}`);
  
  await addLiquidity(
    connection,
    deployer,
    poolResult.poolId,
    LIQUIDITY_STAGES.stageB.miko,
    LIQUIDITY_STAGES.stageB.sol
  );
  
  // Stage C: +300s
  console.log('\n⏰ Waiting for Stage C (+300s)...');
  await waitUntil(poolCreationTime + 300 * 1000);
  
  console.log('📍 Stage C: Adding liquidity...');
  console.log(`   MIKO: ${LIQUIDITY_STAGES.stageC.miko / 1e9}`);
  console.log(`   SOL: ${LIQUIDITY_STAGES.stageC.sol / LAMPORTS_PER_SOL}`);
  
  await addLiquidity(
    connection,
    deployer,
    poolResult.poolId,
    LIQUIDITY_STAGES.stageC.miko,
    LIQUIDITY_STAGES.stageC.sol
  );
  
  console.log('\n✅ All liquidity stages complete!');
  
  // Save pool info
  deployment.pool = {
    address: poolResult.poolId.toBase58(),
    createdAt: new Date(poolCreationTime).toISOString(),
    totalMiko: 900_000_000,
    totalSol: 10
  };
  
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  
  console.log('\n📊 Final pool stats:');
  console.log(`   Total MIKO: 900M (90% of supply)`);
  console.log(`   Total SOL: 10`);
  console.log(`   Pool ID: ${poolResult.poolId.toBase58()}`);
}

async function addLiquidity(
  connection: Connection,
  deployer: Keypair,
  poolId: PublicKey,
  mikoAmount: number,
  solAmount: number
) {
  // This would use the actual Raydium SDK to add liquidity
  // For now, using the add-liquidity script
  process.env.ADD_MIKO_AMOUNT = mikoAmount.toString();
  process.env.ADD_SOL_AMOUNT = solAmount.toString();
  process.env.POOL_ID = poolId.toBase58();
  
  const { addLiquidity: addLiquidityFn } = await import('../scripts/raydium-cpmm-integration');
  await addLiquidityFn();
  
  console.log('✅ Liquidity added');
}

async function waitUntil(targetTime: number) {
  const now = Date.now();
  if (now >= targetTime) return;
  
  const waitMs = targetTime - now;
  const waitSec = Math.round(waitMs / 1000);
  
  for (let i = waitSec; i > 0; i--) {
    process.stdout.write(`\r   ${i}s remaining...`);
    await sleep(1000);
  }
  process.stdout.write('\r                      \r');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    await createTestPool();
  } catch (error) {
    console.error('Error creating pool:', error);
  }
}

main().catch(console.error);