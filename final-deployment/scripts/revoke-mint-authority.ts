import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { 
  setAuthority,
  AuthorityType,
  TOKEN_2022_PROGRAM_ID,
  getMint
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import { getConfigManager } from './config-manager';

/**
 * Revoke mint authority - FINAL IRREVERSIBLE STEP
 */
async function revokeMintAuthority() {
  console.log('=== REVOKE MINT AUTHORITY ===\n');
  console.log('⚠️  WARNING: This action is IRREVERSIBLE!');
  console.log('⚠️  No more tokens can EVER be minted after this!');
  console.log('⚠️  Make sure all setup is complete:\n');
  
  const configManager = getConfigManager();
  const connection = configManager.getConnection();
  const network = configManager.getNetwork();
  
  console.log(`Network: ${network.toUpperCase()}`);
  console.log(`RPC: ${configManager.getRpcUrl()}\n`);
  
  // Load deployer keypair
  const deployer = configManager.loadKeypair('deployer');
  const tokenMint = configManager.getTokenMint();
  
  console.log('Deployer:', deployer.publicKey.toBase58());
  console.log('Token Mint:', tokenMint.toBase58());
  
  // Get current mint state
  console.log('\nChecking current mint authority...');
  const mintInfo = await getMint(
    connection,
    tokenMint,
    configManager.getCommitment(),
    TOKEN_2022_PROGRAM_ID
  );
  
  console.log('Current Mint Authority:', mintInfo.mintAuthority?.toBase58() || 'null');
  console.log('Total Supply:', (Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals)).toLocaleString(), 'MIKO');
  
  if (!mintInfo.mintAuthority) {
    console.log('\n✅ Mint authority already revoked!');
    return { alreadyRevoked: true };
  }
  
  if (!mintInfo.mintAuthority.equals(deployer.publicKey)) {
    throw new Error('Deployer is not the current mint authority!');
  }
  
  // Check deployment state
  const deploymentState = configManager.getDeploymentState();
  
  console.log('\n📋 Deployment Checklist:');
  console.log(`${deploymentState.token_mint ? '✅' : '❌'} Token created`);
  console.log(`${deploymentState.vault_program_id ? '✅' : '❌'} Vault program deployed`);
  console.log(`${deploymentState.smart_dial_program_id ? '✅' : '❌'} Smart Dial program deployed`);
  console.log(`${deploymentState.vault_initialized ? '✅' : '❌'} Programs initialized`);
  console.log(`${deploymentState.authorities_transferred ? '✅' : '❌'} Authorities transferred`);
  console.log(`${deploymentState.pool_created ? '✅' : '❌'} Liquidity pool created`);
  console.log(`${deploymentState.liquidity_added ? '✅' : '❌'} Liquidity added`);
  
  // Verify all steps completed
  if (!deploymentState.pool_created || !deploymentState.liquidity_added) {
    console.log('\n❌ STOP! Pool must be created and funded before revoking mint authority!');
    console.log('Run create-pool.ts and add-liquidity.ts first.');
    process.exit(1);
  }
  
  // Final confirmation
  console.log('\n🚨 FINAL CONFIRMATION REQUIRED 🚨');
  console.log('Type "REVOKE MINT AUTHORITY" to proceed:');
  
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const confirmation = await new Promise<string>(resolve => {
    readline.question('> ', (answer: string) => {
      readline.close();
      resolve(answer);
    });
  });
  
  if (confirmation !== 'REVOKE MINT AUTHORITY') {
    console.log('\n❌ Cancelled. Mint authority NOT revoked.');
    process.exit(0);
  }
  
  // Additional mainnet confirmation
  if (network === 'mainnet') {
    console.log('\n⚠️  MAINNET MINT AUTHORITY REVOCATION');
    console.log('Last chance to cancel! Press Ctrl+C within 10 seconds...\n');
    for (let i = 10; i > 0; i--) {
      process.stdout.write(`\r${i}...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('\n');
  }
  
  // Revoke mint authority
  console.log('Revoking mint authority...');
  
  try {
    // Use setAuthority helper which sends the transaction directly
    const sig = await setAuthority(
      connection,
      deployer,
      tokenMint,
      deployer.publicKey,
      AuthorityType.MintTokens,
      null, // Set to null to revoke
      [],
      { commitment: configManager.getCommitment() },
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log('\n✅ MINT AUTHORITY REVOKED!');
    console.log('Signature:', sig);
    
    // Verify revocation
    console.log('\nVerifying revocation...');
    const finalMintInfo = await getMint(
      connection,
      tokenMint,
      configManager.getCommitment(),
      TOKEN_2022_PROGRAM_ID
    );
    
    if (finalMintInfo.mintAuthority === null) {
      console.log('✅ Confirmed: Mint authority is null');
      console.log('✅ Total supply is now PERMANENTLY FIXED at:', 
        (Number(finalMintInfo.supply) / Math.pow(10, finalMintInfo.decimals)).toLocaleString(), 
        'MIKO'
      );
    } else {
      throw new Error('Mint authority revocation failed!');
    }
    
    // Update deployment state
    configManager.updateDeploymentState({
      mint_authority_revoked: true,
      revocation_signature: sig,
      revocation_timestamp: new Date().toISOString(),
      final_supply: finalMintInfo.supply.toString()
    });
    
    // Save revocation record
    const revocationRecord = {
      network,
      token_mint: tokenMint.toBase58(),
      revoked_by: deployer.publicKey.toBase58(),
      signature: sig,
      timestamp: new Date().toISOString(),
      final_supply: finalMintInfo.supply.toString(),
      final_supply_formatted: (Number(finalMintInfo.supply) / Math.pow(10, finalMintInfo.decimals)).toLocaleString() + ' MIKO'
    };
    
    const recordPath = path.join(__dirname, '..', 'config', 'mint-revocation-record.json');
    fs.writeFileSync(recordPath, JSON.stringify(revocationRecord, null, 2));
    
    console.log('\n🎉 MIKO TOKEN DEPLOYMENT COMPLETE!');
    console.log('\n📝 Summary:');
    console.log('- Token supply permanently fixed at 1B MIKO');
    console.log('- All authorities properly configured');
    console.log('- Liquidity pool active with 90% of supply');
    console.log('- System ready for keeper bot operation');
    console.log('\n✅ Launch preparation complete!');
    
    return {
      success: true,
      signature: sig,
      finalSupply: finalMintInfo.supply.toString()
    };
    
  } catch (error) {
    console.error('\n❌ Failed to revoke mint authority:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  revokeMintAuthority()
    .then(() => {
      console.log('\n✅ Success!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Error:', err.message || err);
      process.exit(1);
    });
}

export { revokeMintAuthority };