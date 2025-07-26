import { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  NATIVE_MINT
} from '@solana/spl-token';
import { Raydium, TxVersion, CurveCalculator } from '@raydium-io/raydium-sdk-v2';
import { BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import { ConfigManager } from './config-manager';

interface TestWallet {
  keypair: Keypair;
  solBalance: number;
  mikoBalance: number;
  index: number;
}

enum SwapDirection {
  SOL_TO_MIKO = 'SOL_TO_MIKO',
  MIKO_TO_SOL = 'MIKO_TO_SOL'
}

enum DEX {
  RAYDIUM = 'RAYDIUM',
  JUPITER = 'JUPITER'
}

// Configuration
const NUM_WALLETS = 20;
const SOL_AIRDROP_PER_WALLET = 2; // 2 SOL per wallet
const ITERATIONS = 50; // Number of swap rounds

async function createSwapTest() {
  // Use ConfigManager to get auto-derived configuration
  const configManager = new ConfigManager('./minimal-config.json');
  const config = await configManager.getFullConfig();
  
  const deployerKp = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8')))
  );
  
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  const poolId = new PublicKey(config.pool.pool_id!);
  const mikoMint = new PublicKey(config.token.mint_address);
  
  console.log('=== Swap Test Script ===');
  console.log(`Pool ID: ${poolId.toBase58()}`);
  console.log(`MIKO Mint: ${mikoMint.toBase58()}`);
  console.log(`Number of test wallets: ${NUM_WALLETS}`);
  console.log(`Iterations: ${ITERATIONS}`);
  
  // Step 1: Create test wallets
  console.log('\n1. Creating test wallets...');
  const testWallets: TestWallet[] = [];
  
  for (let i = 0; i < NUM_WALLETS; i++) {
    const wallet: TestWallet = {
      keypair: Keypair.generate(),
      solBalance: 0,
      mikoBalance: 0,
      index: i + 1
    };
    testWallets.push(wallet);
    console.log(`Wallet ${i + 1}: ${wallet.keypair.publicKey.toBase58()}`);
  }
  
  // Step 2: Get pool info using deployer connection
  console.log('\n2. Loading pool info...');
  const deployerRaydium = await Raydium.load({
    connection,
    owner: deployerKp,
    cluster: 'mainnet',
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: 'confirmed',
  });
  
  const poolData = await deployerRaydium.cpmm.getPoolInfoFromRpc(poolId.toBase58());
  if (!poolData) {
    throw new Error('Pool not found');
  }
  const poolInfo = poolData.poolInfo;
  console.log('Pool loaded successfully');
  console.log('Pool mint A:', poolInfo.mintA.address);
  console.log('Pool mint B:', poolInfo.mintB.address);
  
  console.log('\n3. Airdropping SOL to wallets...');
  const airdropPromises = testWallets.map(async (wallet, i) => {
    try {
      const airdropSig = await connection.requestAirdrop(
        wallet.keypair.publicKey,
        SOL_AIRDROP_PER_WALLET * 1e9
      );
      await connection.confirmTransaction(airdropSig);
      wallet.solBalance = SOL_AIRDROP_PER_WALLET;
      console.log(`Airdropped ${SOL_AIRDROP_PER_WALLET} SOL to wallet ${i + 1}`);
    } catch (error) {
      console.error(`Failed to airdrop to wallet ${i + 1}:`, error);
    }
  });
  
  await Promise.all(airdropPromises);
  
  // Wait for airdrops to be confirmed
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Verify balances
  console.log('\nVerifying wallet balances...');
  for (const wallet of testWallets) {
    const balance = await connection.getBalance(wallet.keypair.publicKey);
    wallet.solBalance = balance / 1e9;
    console.log(`Wallet ${wallet.index}: ${wallet.solBalance} SOL`);
  }
  
  // Step 3: Perform random swaps
  console.log('\n3. Starting swap iterations...');
  console.log('Wallets will acquire MIKO through actual swaps\n');
  
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    console.log(`\n=== Iteration ${iteration + 1}/${ITERATIONS} ===`);
    
    // (1) Randomly select 2-20 wallets
    const numWalletsToSwap = Math.floor(Math.random() * 19) + 2; // 2-20
    console.log(`Selecting ${numWalletsToSwap} wallets for swapping`);
    
    // Shuffle wallets and take first N
    const shuffled = [...testWallets].sort(() => Math.random() - 0.5);
    const selectedWallets = shuffled.slice(0, numWalletsToSwap);
    
    for (const wallet of selectedWallets) {
      // (2) Determine swap direction based on wallet balances
      let swapDirection: SwapDirection;
      
      if (wallet.mikoBalance === 0) {
        // Wallet has no MIKO, must swap SOL to MIKO
        swapDirection = SwapDirection.SOL_TO_MIKO;
      } else if (wallet.solBalance < 0.1) {
        // Low on SOL, swap MIKO to SOL if possible
        swapDirection = SwapDirection.MIKO_TO_SOL;
      } else {
        // Has both, randomly choose direction
        swapDirection = Math.random() < 0.5 ? SwapDirection.SOL_TO_MIKO : SwapDirection.MIKO_TO_SOL;
      }
      
      // (3) Random amount within budget
      let swapAmount: number;
      if (swapDirection === SwapDirection.SOL_TO_MIKO) {
        // Random SOL amount (10% to 50% of available balance)
        const availableSol = wallet.solBalance - 0.05; // Keep 0.05 SOL for fees
        if (availableSol <= 0) {
          console.log(`Wallet ${wallet.index}: Insufficient SOL balance, skipping`);
          continue;
        }
        const minAmount = availableSol * 0.1;
        const maxAmount = availableSol * 0.5;
        swapAmount = minAmount + Math.random() * (maxAmount - minAmount);
      } else {
        // Random MIKO amount (10% to 50% of balance)
        const minAmount = wallet.mikoBalance * 0.1;
        const maxAmount = wallet.mikoBalance * 0.5;
        swapAmount = minAmount + Math.random() * (maxAmount - minAmount);
      }
      
      // (4) Random DEX selection
      const dex = Math.random() < 0.5 ? DEX.RAYDIUM : DEX.JUPITER;
      
      console.log(`Wallet ${wallet.index}: ${swapDirection} ${swapAmount.toFixed(4)} ${swapDirection === SwapDirection.SOL_TO_MIKO ? 'SOL' : 'MIKO'} on ${dex}`);
      
      // Execute real swap using Raydium
      try {
        // Create Raydium instance for this wallet
        const walletRaydium = await Raydium.load({
          connection,
          owner: wallet.keypair,
          cluster: 'mainnet',
          disableFeatureCheck: true,
          disableLoadToken: true,
          blockhashCommitment: 'confirmed',
        });
        
        if (swapDirection === SwapDirection.SOL_TO_MIKO) {
          // Create WSOL account and wrap SOL
          const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, wallet.keypair.publicKey);
          const wsolAccountInfo = await connection.getAccountInfo(wsolAta);
          
          const tx = new Transaction();
          if (!wsolAccountInfo) {
            tx.add(createAssociatedTokenAccountInstruction(
              wallet.keypair.publicKey,
              wsolAta,
              wallet.keypair.publicKey,
              NATIVE_MINT
            ));
          }
          
          // Transfer SOL to WSOL account
          tx.add(SystemProgram.transfer({
            fromPubkey: wallet.keypair.publicKey,
            toPubkey: wsolAta,
            lamports: Math.floor(swapAmount * 1e9),
          }));
          
          // Sync native account
          tx.add(createSyncNativeInstruction(wsolAta));
          
          await sendAndConfirmTransaction(connection, tx, [wallet.keypair]);
          
          // Now swap WSOL to MIKO using Raydium
          const inputAmount = new BN(Math.floor(swapAmount * 1e9));
          
          // Check if WSOL is mintA (baseIn = true) or mintB (baseIn = false)
          const baseIn = poolInfo.mintA.address === NATIVE_MINT.toBase58();
          
          // Calculate swap output
          const swapResult = CurveCalculator.swap(
            inputAmount,
            baseIn ? poolData.rpcData.baseReserve : poolData.rpcData.quoteReserve,
            baseIn ? poolData.rpcData.quoteReserve : poolData.rpcData.baseReserve,
            poolData.rpcData.configInfo!.tradeFeeRate
          );
          
          const { execute, transaction } = await walletRaydium.cpmm.swap({
            poolInfo: poolData.poolInfo,
            poolKeys: poolData.poolKeys,
            txVersion: TxVersion.LEGACY,
            baseIn,
            inputAmount,
            swapResult,
            slippage: 0.1, // 10%
          });
          
          // Log transaction details to debug
          console.log(`    Transaction has ${(transaction as Transaction).instructions.length} instructions`);
          console.log(`    Input amount: ${inputAmount.toString()}`);
          console.log(`    Swap result:`, swapResult);
          
          // Execute directly or use transaction
          const swapTxId = await sendAndConfirmTransaction(
            connection,
            transaction as Transaction,
            [wallet.keypair],
            { commitment: 'confirmed' }
          );
          
          console.log(`    Swap tx: ${swapTxId.substring(0, 16)}...`);
          
          // Close WSOL account to reclaim rent
          const closeTx = new Transaction();
          closeTx.add(createCloseAccountInstruction(
            wsolAta,
            wallet.keypair.publicKey,
            wallet.keypair.publicKey
          ));
          await sendAndConfirmTransaction(connection, closeTx, [wallet.keypair]);
          
        } else {
          // Swap MIKO to SOL
          const inputAmount = new BN(Math.floor(swapAmount * 1e9));
          
          // MIKO is mintB, so baseIn = false when swapping MIKO
          const baseIn = false;
          
          // Calculate swap output
          const swapResult = CurveCalculator.swap(
            inputAmount,
            baseIn ? poolData.rpcData.baseReserve : poolData.rpcData.quoteReserve,
            baseIn ? poolData.rpcData.quoteReserve : poolData.rpcData.baseReserve,
            poolData.rpcData.configInfo!.tradeFeeRate
          );
          
          const { execute, transaction } = await walletRaydium.cpmm.swap({
            poolInfo: poolData.poolInfo,
            poolKeys: poolData.poolKeys,
            txVersion: TxVersion.LEGACY,
            baseIn,
            inputAmount,
            swapResult,
            slippage: 0.1, // 10%
          });
          
          // Log transaction details to debug
          console.log(`    Transaction has ${(transaction as Transaction).instructions.length} instructions`);
          console.log(`    Input amount: ${inputAmount.toString()}`);
          console.log(`    Swap result:`, swapResult);
          
          const swapTxId = await sendAndConfirmTransaction(
            connection,
            transaction as Transaction,
            [wallet.keypair],
            { commitment: 'confirmed' }
          );
          
          console.log(`    Swap tx: ${swapTxId.substring(0, 16)}...`);
        }
        
        // Update wallet balances
        const newSolBalance = await connection.getBalance(wallet.keypair.publicKey);
        wallet.solBalance = newSolBalance / 1e9;
        
        const mikoAta = getAssociatedTokenAddressSync(mikoMint, wallet.keypair.publicKey, false, TOKEN_2022_PROGRAM_ID);
        try {
          const mikoAccount = await getAccount(connection, mikoAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
          wallet.mikoBalance = Number(mikoAccount.amount) / 1e9;
        } catch {
          wallet.mikoBalance = 0;
        }
        
      } catch (error) {
        console.log(`    Swap failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Log total accumulated tax (estimate)
    const totalSwapVolume = selectedWallets.length * 1_000_000; // Rough estimate
    const estimatedTax = totalSwapVolume * 0.05;
    console.log(`\nEstimated tax generated this iteration: ~${estimatedTax.toLocaleString()} MIKO`);
    
    // Wait between iterations
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
  }
  
  // Final summary
  console.log('\n=== Swap Test Summary ===');
  let totalMikoHeld = 0;
  let totalSolHeld = 0;
  
  for (const wallet of testWallets) {
    totalMikoHeld += wallet.mikoBalance;
    totalSolHeld += wallet.solBalance;
  }
  
  console.log(`Total MIKO held by test wallets: ${totalMikoHeld.toLocaleString()}`);
  console.log(`Total SOL held by test wallets: ${totalSolHeld.toFixed(4)}`);
  console.log('\nEach swap generates 5% tax that accumulates as withheld fees');
  console.log('Keeper bot will harvest when 500k MIKO threshold is reached');
}

createSwapTest().catch(console.error);