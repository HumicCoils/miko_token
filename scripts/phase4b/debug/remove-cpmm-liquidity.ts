import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Raydium, TxVersion, Percent } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import * as fs from 'fs';
import * as path from 'path';

async function removeCPMMLiquidity() {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  // Load deployer
  const deployerData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'phase4b-deployer.json'), 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  // Pool ID from previous creation
  const poolId = 'BJshJ58WUTC9bKar7QidUJM278rrMrmqSgj4SbKve44';
  
  console.log('Removing liquidity from CPMM pool...');
  console.log('Pool ID:', poolId);
  console.log('Owner:', deployer.publicKey.toBase58());
  
  try {
    // Initialize Raydium SDK
    const raydium = await Raydium.load({
      owner: deployer,
      connection,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: false,
      blockhashCommitment: 'confirmed',
    });
    
    // Get pool info from RPC (since we're on a fork)
    const { poolInfo, poolKeys } = await raydium.cpmm.getPoolInfoFromRpc(poolId);
    console.log('Pool info retrieved');
    console.log('LP Mint:', poolInfo.lpMint.address);
    console.log('Mint A:', poolInfo.mintA.address);
    console.log('Mint B:', poolInfo.mintB.address);
    
    // Get LP token balance
    const lpAta = getAssociatedTokenAddressSync(
      new PublicKey(poolInfo.lpMint.address),
      deployer.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    
    const lpBalance = await connection.getTokenAccountBalance(lpAta);
    console.log('LP Token Balance:', lpBalance.value.uiAmount);
    
    if (!lpBalance.value.uiAmount || lpBalance.value.uiAmount === 0) {
      console.log('No LP tokens to remove!');
      return;
    }
    
    // Create slippage as Percent object
    const slippage = new Percent(1, 100); // 1% slippage
    
    // Remove all liquidity
    const { execute, transaction } = await raydium.cpmm.withdrawLiquidity({
      poolInfo,
      poolKeys,
      lpAmount: new BN(lpBalance.value.amount), // Remove all LP tokens
      slippage,
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: 200000,
        microLamports: 100000,
      },
    });
    
    console.log('Executing transaction...');
    const { txId } = await execute({ sendAndConfirm: true });
    
    console.log('✅ Liquidity removed successfully!');
    console.log('Transaction:', txId);
    
    // Check final balances
    const mikoAta = getAssociatedTokenAddressSync(
      new PublicKey('BKEBGQwMd2AKB9ae9t2oy9RELY7KUbB2iYrXmGMfXDsE'),
      deployer.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    const mikoBalance = await connection.getTokenAccountBalance(mikoAta);
    const solBalance = await connection.getBalance(deployer.publicKey);
    
    console.log('\nFinal balances:');
    console.log('MIKO:', mikoBalance.value.uiAmount);
    console.log('SOL:', solBalance / 1e9);
    
  } catch (error: any) {
    console.error('Failed to remove liquidity:', error);
    if (error.logs) {
      console.error('Program logs:', error.logs);
    }
  }
}

removeCPMMLiquidity().catch(console.error);