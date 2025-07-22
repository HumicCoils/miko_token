import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID, 
  setAuthority, 
  AuthorityType,
  getMint
} from '@solana/spl-token';
import * as fs from 'fs';

const FORK_URL = 'http://127.0.0.1:8899';

// Load configurations
const config = JSON.parse(fs.readFileSync('phase4b-config.json', 'utf-8'));

async function revokeMintAuthority() {
  const connection = new Connection(FORK_URL, 'confirmed');
  
  // Load deployer
  const deployerData = JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  const mintPubkey = new PublicKey(config.mikoToken);
  
  console.log('Revoking mint authority...');
  console.log('MIKO Token:', mintPubkey.toBase58());
  console.log('Current Authority:', deployer.publicKey.toBase58());
  
  // Get current mint info
  const mintInfoBefore = await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
  
  console.log('\nBefore revocation:');
  console.log('- Mint Authority:', mintInfoBefore.mintAuthority?.toBase58() || 'null');
  console.log('- Total Supply:', (mintInfoBefore.supply / BigInt(10 ** 9)).toString(), 'MIKO');
  
  if (!mintInfoBefore.mintAuthority) {
    console.log('\nMint authority is already null!');
    return;
  }
  
  try {
    // Revoke mint authority (set to null)
    console.log('\nRevoking mint authority (setting to null)...');
    const revokeSig = await setAuthority(
      connection,
      deployer,
      mintPubkey,
      deployer,
      AuthorityType.MintTokens,
      null, // Set to null to permanently revoke
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log('✓ Mint authority revoked! Tx:', revokeSig);
    
    // Verify revocation
    const mintInfoAfter = await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('\nAfter revocation:');
    console.log('- Mint Authority:', mintInfoAfter.mintAuthority?.toBase58() || 'null (permanently revoked)');
    console.log('- Total Supply:', (mintInfoAfter.supply / BigInt(10 ** 9)).toString(), 'MIKO (no more can be minted)');
    
    // Save revocation info
    const revocationInfo = {
      timestamp: new Date().toISOString(),
      token: mintPubkey.toBase58(),
      previousAuthority: deployer.publicKey.toBase58(),
      newAuthority: null,
      signature: revokeSig,
      totalSupply: '1,000,000,000 MIKO',
      note: 'Mint authority permanently revoked. No more MIKO can ever be minted.',
    };
    
    fs.writeFileSync('phase4b-mint-authority-revocation.json', JSON.stringify(revocationInfo, null, 2));
    console.log('\nRevocation info saved to phase4b-mint-authority-revocation.json');
    
  } catch (error) {
    console.error('Failed to revoke mint authority:', error);
  }
}

revokeMintAuthority().catch(console.error);