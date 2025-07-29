import { Connection, PublicKey } from '@solana/web3.js';
import { ConfigManager } from '../config-manager';
import { Raydium } from '@raydium-io/raydium-sdk-v2';

async function examinePoolState() {
  const configManager = new ConfigManager('../minimal-config.json');
  const config = await configManager.getFullConfig();
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  
  const poolId = new PublicKey(config.pool.pool_id!);
  
  console.log('=== Pool State Analysis ===\n');
  
  // Initialize Raydium SDK to get pool info
  const raydium = await Raydium.load({
    connection,
    owner: PublicKey.default,
    cluster: 'devnet',
    disableFeatureCheck: true,
    disableLoadToken: false,
    blockhashCommitment: 'confirmed',
  });
  
  try {
    // Get pool info from Raydium
    const poolInfo = await raydium.cpmm.getPoolInfoFromRpc(poolId.toBase58());
    
    console.log('Pool Info:');
    console.log('ID:', poolInfo.id);
    console.log('Mint A:', poolInfo.mintA.address);
    console.log('Mint B:', poolInfo.mintB.address);
    console.log('Vault A:', poolInfo.vaultA.address);
    console.log('Vault B:', poolInfo.vaultB.address);
    console.log('Vault A Amount:', poolInfo.vaultA.amount);
    console.log('Vault B Amount:', poolInfo.vaultB.amount);
    
    // Check which is MIKO
    const mikoMint = config.token.mint_address;
    if (poolInfo.mintB.address === mikoMint) {
      console.log('\nMIKO is Mint B');
      console.log('MIKO in pool:', Number(poolInfo.vaultB.amount) / 1e9, 'MIKO');
      console.log('SOL in pool:', Number(poolInfo.vaultA.amount) / 1e9, 'SOL');
      
      console.log('\nExpected vs Actual:');
      console.log('MIKO: Expected 900M, Actual', Number(poolInfo.vaultB.amount) / 1e9);
      console.log('Difference:', 900_000_000 - Number(poolInfo.vaultB.amount) / 1e9, 'MIKO');
    } else {
      console.log('\nMIKO is Mint A');
      console.log('MIKO in pool:', Number(poolInfo.vaultA.amount) / 1e9, 'MIKO');
      console.log('SOL in pool:', Number(poolInfo.vaultB.amount) / 1e9, 'SOL');
      
      console.log('\nExpected vs Actual:');
      console.log('MIKO: Expected 900M, Actual', Number(poolInfo.vaultA.amount) / 1e9);
      console.log('Difference:', 900_000_000 - Number(poolInfo.vaultA.amount) / 1e9, 'MIKO');
    }
    
    // Check pool token account
    const poolTokenAccount = new PublicKey('GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL');
    console.log('\n=== Pool Token Account Analysis ===');
    console.log('Address:', poolTokenAccount.toBase58());
    
    // Get token account info
    const tokenAccountInfo = await connection.getParsedAccountInfo(poolTokenAccount);
    if (tokenAccountInfo.value && 'parsed' in tokenAccountInfo.value.data) {
      const parsed = tokenAccountInfo.value.data.parsed;
      console.log('Owner:', parsed.info.owner);
      console.log('Mint:', parsed.info.mint);
      console.log('Balance:', parsed.info.tokenAmount.uiAmount, 'tokens');
    }
    
  } catch (error) {
    console.error('Error getting pool info:', error);
    
    // Manual check of pool token account
    console.log('\n=== Manual Pool Token Account Check ===');
    const tokenAccountInfo = await connection.getParsedAccountInfo(new PublicKey('GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL'));
    if (tokenAccountInfo.value) {
      console.log('Account exists');
      console.log('Owner program:', tokenAccountInfo.value.owner.toBase58());
      if ('parsed' in tokenAccountInfo.value.data) {
        console.log('Token info:', tokenAccountInfo.value.data.parsed.info);
      }
    }
  }
}

examinePoolState().catch(console.error);