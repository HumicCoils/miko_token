import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  NATIVE_MINT
} from '@solana/spl-token';
import { Raydium, TxVersion, Percent } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import * as fs from 'fs';
import { ConfigManager } from './config-manager';

async function addLiquidityToExistingPool() {
  // Use ConfigManager to get auto-derived configuration
  const configManager = new ConfigManager('./minimal-config.json');
  const config = await configManager.getFullConfig();
  
  const deployerKp = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8')))
  );
  
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  const poolId = new PublicKey(config.pool.pool_id!);
  const mikoMint = new PublicKey(config.token.mint_address);
  
  console.log('=== Add Liquidity to Existing CPMM Pool ===');
  console.log(`Pool ID: ${poolId.toBase58()}`);
  console.log(`MIKO Mint: ${mikoMint.toBase58()}`);
  console.log(`Deployer: ${deployerKp.publicKey.toBase58()}`);
  
  // Amount to add
  const mikoToAdd = 630_000_000; // 630M MIKO
  const solToAdd = 7; // 7 SOL
  const mikoToAddWithDecimals = BigInt(mikoToAdd * 1e9);
  const solToAddWithDecimals = BigInt(solToAdd * 1e9);
  
  console.log(`\nAdding liquidity:`);
  console.log(`- MIKO: ${mikoToAdd.toLocaleString()}`);
  console.log(`- SOL: ${solToAdd}`);
  console.log(`\nThis will bring pool total to:`);
  console.log(`- MIKO: 900,000,000 (90% of supply)`);
  console.log(`- SOL: 10`);
  
  // Get deployer's token accounts
  const deployerMikoAta = getAssociatedTokenAddressSync(
    mikoMint,
    deployerKp.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  const deployerWsolAta = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    deployerKp.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );
  
  // Check balances
  const mikoAccount = await getAccount(connection, deployerMikoAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
  const mikoBalance = Number(mikoAccount.amount) / 1e9;
  console.log(`\nDeployer MIKO balance: ${mikoBalance.toLocaleString()}`);
  
  const solBalance = await connection.getBalance(deployerKp.publicKey);
  console.log(`Deployer SOL balance: ${(solBalance / 1e9).toFixed(4)}`);
  
  // Verify sufficient balances
  if (mikoBalance < mikoToAdd) {
    throw new Error(`Insufficient MIKO balance. Need ${mikoToAdd}, have ${mikoBalance}`);
  }
  
  if (solBalance < solToAddWithDecimals) {
    throw new Error(`Insufficient SOL balance. Need ${solToAdd}, have ${solBalance / 1e9}`);
  }
  
  // Verify sufficient balances
  if (mikoBalance < mikoToAdd) {
    throw new Error(`Insufficient MIKO balance. Need ${mikoToAdd}, have ${mikoBalance}`);
  }
  
  if (solBalance < solToAddWithDecimals) {
    throw new Error(`Insufficient SOL balance. Need ${solToAdd}, have ${solBalance / 1e9}`);
  }
  
  try {
    // Initialize Raydium SDK
    const raydium = await Raydium.load({
      owner: deployerKp,
      connection,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: false,
      blockhashCommitment: 'confirmed',
    });
    
    // Get pool info
    console.log('\nFetching pool info...');
    const { poolInfo, poolKeys } = await raydium.cpmm.getPoolInfoFromRpc(poolId);
    
    if (!poolInfo) {
      throw new Error('Pool not found');
    }
    
    console.log('Pool found:');
    console.log(`- LP Mint: ${poolInfo.lpMint.address}`);
    console.log(`- Mint A: ${poolInfo.mintA.address} (${poolInfo.mintA.symbol})`);
    console.log(`- Mint B: ${poolInfo.mintB.address} (${poolInfo.mintB.symbol})`);
    
    // Create WSOL account if needed
    const wsolInfo = await connection.getAccountInfo(deployerWsolAta);
    if (!wsolInfo) {
      console.log('\nCreating WSOL account...');
      const createWsolTx = new Transaction();
      createWsolTx.add(
        createAssociatedTokenAccountInstruction(
          deployerKp.publicKey,
          deployerWsolAta,
          deployerKp.publicKey,
          NATIVE_MINT,
          TOKEN_PROGRAM_ID
        )
      );
      const { blockhash } = await connection.getLatestBlockhash();
      createWsolTx.recentBlockhash = blockhash;
      createWsolTx.feePayer = deployerKp.publicKey;
      
      const sig = await connection.sendTransaction(createWsolTx, [deployerKp]);
      await connection.confirmTransaction(sig);
      console.log('WSOL account created');
    }
    
    // Wrap SOL
    console.log('\nWrapping SOL...');
    const wrapSolTx = new Transaction();
    wrapSolTx.add(
      SystemProgram.transfer({
        fromPubkey: deployerKp.publicKey,
        toPubkey: deployerWsolAta,
        lamports: solToAddWithDecimals,
      }),
      createSyncNativeInstruction(deployerWsolAta, TOKEN_PROGRAM_ID)
    );
    
    const { blockhash: wrapBlockhash } = await connection.getLatestBlockhash();
    wrapSolTx.recentBlockhash = wrapBlockhash;
    wrapSolTx.feePayer = deployerKp.publicKey;
    
    const wrapSig = await connection.sendTransaction(wrapSolTx, [deployerKp]);
    await connection.confirmTransaction(wrapSig);
    console.log('SOL wrapped successfully');
    
    // Prepare deposit
    console.log('\nPreparing liquidity deposit...');
    
    // Determine which mint is which
    const isMintAMiko = poolInfo.mintA.address === mikoMint.toBase58();
    console.log(`\nMIKO is mint ${isMintAMiko ? 'A' : 'B'}`);
    
    // Use MIKO as input amount
    const baseIn = isMintAMiko; // true if MIKO is mintA
    const inputAmount = new BN(
      new Decimal(mikoToAdd)
        .mul(10 ** 9) // MIKO has 9 decimals
        .toFixed(0)
    );
    
    const slippage = new Percent(1, 100); // 1% slippage
    
    console.log(`Adding with ${mikoToAdd} MIKO as input`);
    
    const { execute } = await raydium.cpmm.addLiquidity({
      poolInfo,
      poolKeys,
      inputAmount,
      slippage,
      baseIn,
      txVersion: TxVersion.V0,
    });
    
    // Execute transaction
    console.log('\nExecuting liquidity deposit...');
    const { txId } = await execute({ sendAndConfirm: true });
    
    console.log(`\nLiquidity added successfully!`);
    console.log(`Transaction: ${txId}`);
    console.log(`\nPool now contains approximately:`);
    console.log(`- Total MIKO: 900,000,000 (90% of supply)`);
    console.log(`- Total SOL: 10`);
    
  } catch (error) {
    console.error('Error adding liquidity:', error);
    throw error;
  }
}

addLiquidityToExistingPool().catch(console.error);