import { Connection, PublicKey } from '@solana/web3.js';
import { ConfigManager } from '../config-manager';

async function checkPoolReserves() {
  const configManager = new ConfigManager('../minimal-config.json');
  const config = await configManager.getFullConfig();
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  
  const poolId = new PublicKey(config.pool.pool_id!);
  
  console.log('=== Checking Pool Reserves ===\n');
  console.log('Pool ID:', poolId.toBase58());
  
  // Get pool account data
  const poolAccount = await connection.getAccountInfo(poolId);
  if (!poolAccount) {
    console.log('Pool account not found');
    return;
  }
  
  // CPMM pool data structure parsing
  const poolData = poolAccount.data;
  let offset = 8; // Skip discriminator
  
  // Read vault addresses (2 vaults for token pair)
  const vault0 = new PublicKey(poolData.slice(offset + 32, offset + 64));
  const vault1 = new PublicKey(poolData.slice(offset + 64, offset + 96));
  
  console.log('Vault 0:', vault0.toBase58());
  console.log('Vault 1:', vault1.toBase58());
  
  // Get vault balances
  const vault0Account = await connection.getTokenAccountBalance(vault0);
  const vault1Account = await connection.getTokenAccountBalance(vault1);
  
  console.log('\nVault Balances:');
  console.log('Vault 0:', vault0Account.value.uiAmount, vault0Account.value.mint);
  console.log('Vault 1:', vault1Account.value.uiAmount, vault1Account.value.mint);
  
  // Check which vault is MIKO and which is SOL
  const mikoMint = config.token.mint_address;
  const solMint = 'So11111111111111111111111111111111111111112';
  
  if (vault0Account.value.mint === mikoMint) {
    console.log('\nPool Reserves:');
    console.log('MIKO:', vault0Account.value.uiAmount);
    console.log('WSOL:', vault1Account.value.uiAmount);
    console.log('\nExpected vs Actual:');
    console.log('MIKO: Expected 900M, Actual', vault0Account.value.uiAmount);
    console.log('Difference:', 900_000_000 - (vault0Account.value.uiAmount || 0), 'MIKO');
  } else {
    console.log('\nPool Reserves:');
    console.log('WSOL:', vault0Account.value.uiAmount);
    console.log('MIKO:', vault1Account.value.uiAmount);
    console.log('\nExpected vs Actual:');
    console.log('MIKO: Expected 900M, Actual', vault1Account.value.uiAmount);
    console.log('Difference:', 900_000_000 - (vault1Account.value.uiAmount || 0), 'MIKO');
  }
  
  // Get LP mint info
  const lpMintOffset = offset + 128; // After vaults and other fields
  const lpMint = new PublicKey(poolData.slice(lpMintOffset, lpMintOffset + 32));
  console.log('\nLP Mint:', lpMint.toBase58());
  
  const lpSupply = await connection.getTokenSupply(lpMint);
  console.log('LP Supply:', lpSupply.value.uiAmount);
}

checkPoolReserves().catch(console.error);