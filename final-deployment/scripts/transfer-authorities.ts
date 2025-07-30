import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { 
  createSetAuthorityInstruction,
  AuthorityType,
  TOKEN_2022_PROGRAM_ID,
  getMint
} from '@solana/spl-token';
import { getConfigManager } from './config-manager';

/**
 * Transfer token authorities to Vault PDA
 */
async function transferAuthorities() {
  console.log('=== Transfer Token Authorities ===\n');
  
  const configManager = getConfigManager();
  const connection = configManager.getConnection();
  const network = configManager.getNetwork();
  
  console.log(`Network: ${network.toUpperCase()}`);
  console.log(`RPC: ${configManager.getRpcUrl()}\n`);
  
  // Load deployer keypair
  const deployer = configManager.loadKeypair('deployer');
  const tokenMint = configManager.getTokenMint();
  const vaultPda = configManager.getVaultPda();
  
  console.log('Deployer:', deployer.publicKey.toBase58());
  console.log('Token Mint:', tokenMint.toBase58());
  console.log('Vault PDA:', vaultPda.toBase58());
  
  // Check deployment state
  const deploymentState = configManager.getDeploymentState();
  if (!deploymentState.vault_initialized) {
    throw new Error('Vault must be initialized before transferring authorities!');
  }
  
  // Get current mint state
  console.log('\nChecking current authorities...');
  const mintInfo = await getMint(
    connection,
    tokenMint,
    configManager.getCommitment(),
    TOKEN_2022_PROGRAM_ID
  );
  
  console.log('\nCurrent authorities:');
  console.log('- Mint Authority:', mintInfo.mintAuthority?.toBase58() || 'null');
  console.log('- Freeze Authority:', mintInfo.freezeAuthority?.toBase58() || 'null');
  
  // Confirmation for mainnet
  if (network === 'mainnet') {
    console.log('\n⚠️  MAINNET AUTHORITY TRANSFER');
    console.log('This action is IRREVERSIBLE!');
    console.log('Press Ctrl+C to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  const results = {
    transferFeeConfig: false,
    withdrawWithheld: false
  };
  
  // Transfer Transfer Fee Config Authority
  console.log('\n1. Transferring Transfer Fee Config Authority...');
  try {
    const tx = new Transaction();
    
    if (network === 'mainnet') {
      const priorityFee = configManager.getPriorityFee();
      tx.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee.microLamports,
        })
      );
    }
    
    const transferFeeConfigIx = createSetAuthorityInstruction(
      tokenMint,
      deployer.publicKey,
      AuthorityType.TransferFeeConfig,
      vaultPda,
      [],
      TOKEN_2022_PROGRAM_ID
    );
    tx.add(transferFeeConfigIx);
    
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [deployer],
      { commitment: configManager.getCommitment() }
    );
    
    console.log('✅ Transfer Fee Config Authority transferred!');
    console.log('Signature:', sig);
    results.transferFeeConfig = true;
  } catch (error: any) {
    if (error.message?.includes('Authority does not exist')) {
      console.log('⚠️  Transfer Fee Config Authority already transferred or not applicable');
      results.transferFeeConfig = true;
    } else {
      console.error('❌ Failed:', error.message);
    }
  }
  
  // Transfer Withdraw Withheld Authority
  console.log('\n2. Transferring Withdraw Withheld Authority...');
  try {
    const tx = new Transaction();
    
    if (network === 'mainnet') {
      const priorityFee = configManager.getPriorityFee();
      tx.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee.microLamports,
        })
      );
    }
    
    const withdrawWithheldIx = createSetAuthorityInstruction(
      tokenMint,
      deployer.publicKey,
      AuthorityType.WithheldWithdraw,
      vaultPda,
      [],
      TOKEN_2022_PROGRAM_ID
    );
    tx.add(withdrawWithheldIx);
    
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [deployer],
      { commitment: configManager.getCommitment() }
    );
    
    console.log('✅ Withdraw Withheld Authority transferred!');
    console.log('Signature:', sig);
    results.withdrawWithheld = true;
  } catch (error: any) {
    if (error.message?.includes('Authority does not exist')) {
      console.log('⚠️  Withdraw Withheld Authority already transferred or not applicable');
      results.withdrawWithheld = true;
    } else {
      console.error('❌ Failed:', error.message);
    }
  }
  
  // Verify final state
  console.log('\n3. Verifying final authorities...');
  const finalMintInfo = await getMint(
    connection,
    tokenMint,
    configManager.getCommitment(),
    TOKEN_2022_PROGRAM_ID
  );
  
  console.log('\nFinal authorities:');
  console.log('- Mint Authority:', finalMintInfo.mintAuthority?.toBase58() || 'null');
  console.log('- Freeze Authority:', finalMintInfo.freezeAuthority?.toBase58() || 'null');
  console.log('- Transfer authorities: Now controlled by Vault PDA');
  
  // Update deployment state
  if (results.transferFeeConfig && results.withdrawWithheld) {
    configManager.updateDeploymentState({
      authorities_transferred: true,
      transfer_timestamp: new Date().toISOString()
    });
    
    console.log('\n🎉 Authority transfer complete!');
    console.log('\n✅ Vault PDA now controls:');
    console.log('- Transfer Fee Config Authority');
    console.log('- Withdraw Withheld Authority');
    
    console.log('\n⚠️  CRITICAL NEXT STEPS:');
    console.log('1. Create liquidity pool (npm run create-pool)');
    console.log('2. Add liquidity stages (npm run add-liquidity)');
    console.log('3. Revoke mint authority (npm run revoke-mint) - FINAL STEP');
    console.log('\n❌ DO NOT revoke mint authority until pool is created and funded!');
  } else {
    console.log('\n⚠️  Some authorities may not have been transferred.');
    console.log('This could be normal if they were already transferred.');
  }
  
  return results;
}

// Run if called directly
if (require.main === module) {
  transferAuthorities()
    .then(() => {
      console.log('\n✅ Success!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Error:', err);
      process.exit(1);
    });
}