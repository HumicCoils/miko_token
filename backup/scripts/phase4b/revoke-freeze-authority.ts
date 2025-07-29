import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID, 
  setAuthority, 
  AuthorityType,
  getMint
} from '@solana/spl-token';
import * as fs from 'fs';
import { ConfigManager } from './config-manager';

async function revokeFreezeAuthority() {
  // Use ConfigManager to get auto-derived configuration
  const configManager = new ConfigManager('./minimal-config.json');
  const config = await configManager.getFullConfig();
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  
  // Load deployer
  const deployerData = JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  const mintPubkey = new PublicKey(config.token.mint_address);
  
  console.log('Revoking freeze authority...');
  console.log('MIKO Token:', mintPubkey.toBase58());
  console.log('Current Authority:', deployer.publicKey.toBase58());
  
  // Get current mint info
  const mintInfoBefore = await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
  
  console.log('\nBefore revocation:');
  console.log('- Freeze Authority:', mintInfoBefore.freezeAuthority?.toBase58() || 'null');
  
  if (!mintInfoBefore.freezeAuthority) {
    console.log('\nFreeze authority is already null!');
    return;
  }
  
  try {
    // Revoke freeze authority (set to null)
    console.log('\nRevoking freeze authority (setting to null)...');
    const revokeSig = await setAuthority(
      connection,
      deployer,
      mintPubkey,
      deployer,
      AuthorityType.FreezeAccount,
      null, // Set to null to permanently revoke
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log('✓ Freeze authority revoked! Tx:', revokeSig);
    
    // Verify revocation
    const mintInfoAfter = await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('\nAfter revocation:');
    console.log('- Freeze Authority:', mintInfoAfter.freezeAuthority?.toBase58() || 'null (permanently revoked)');
    
    // Save revocation info
    const revocationInfo = {
      timestamp: new Date().toISOString(),
      token: mintPubkey.toBase58(),
      previousAuthority: deployer.publicKey.toBase58(),
      newAuthority: null,
      signature: revokeSig,
      note: 'Freeze authority permanently revoked. No accounts can ever be frozen.',
    };
    
    fs.writeFileSync('phase4b-freeze-authority-revocation.json', JSON.stringify(revocationInfo, null, 2));
    console.log('\nRevocation info saved to phase4b-freeze-authority-revocation.json');
    
  } catch (error) {
    console.error('Failed to revoke freeze authority:', error);
  }
}

revokeFreezeAuthority().catch(console.error);