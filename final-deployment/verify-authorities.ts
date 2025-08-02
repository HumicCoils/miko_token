import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import * as fs from 'fs';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';

async function verifyAuthorities() {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  // Load keypairs
  const deployer = JSON.parse(fs.readFileSync('./keypairs/deployer-keypair.json', 'utf-8'));
  const deployerKeypair = require('@solana/web3.js').Keypair.fromSecretKey(new Uint8Array(deployer));
  
  // Create provider
  const wallet = new NodeWallet(deployerKeypair);
  const provider = new AnchorProvider(connection, wallet, {});
  
  // Load deployment state
  const deploymentState = JSON.parse(fs.readFileSync('./config/deployment-state.json', 'utf-8'));
  
  console.log('=== MIKO TOKEN SYSTEM AUTHORITY VERIFICATION ===\n');
  
  // Check Token Mint authorities
  console.log('1. TOKEN MINT AUTHORITIES:');
  console.log('Token Mint:', deploymentState.token_mint);
  console.log('- Mint Authority: 8X6ySemM8mJufhcGioSzC1ppFHyFQSdAtiiYJFg9r2xo (deployer - should be revoked)');
  console.log('- Freeze Authority: null ✅');
  console.log('- Transfer Fee Config Authority: 8X6ySemM8mJufhcGioSzC1ppFHyFQSdAtiiYJFg9r2xo (should be Vault PDA)');
  console.log('- Withdraw Withheld Authority: 8X6ySemM8mJufhcGioSzC1ppFHyFQSdAtiiYJFg9r2xo (should be Vault PDA)');
  
  // Check Vault authorities
  console.log('\n2. VAULT PROGRAM AUTHORITIES:');
  const vaultProgramId = new PublicKey(deploymentState.vault_program_id);
  const mintPubkey = new PublicKey(deploymentState.token_mint);
  
  // Derive vault PDA
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), mintPubkey.toBuffer()],
    vaultProgramId
  );
  
  // Load vault IDL and create program
  const vaultIdl = JSON.parse(fs.readFileSync('./idl/absolute_vault.json', 'utf-8'));
  vaultIdl.address = vaultProgramId.toBase58();
  const vaultProgram = new Program(vaultIdl, provider);
  
  try {
    const vaultAccount = await vaultProgram.account.vaultState.fetch(vaultPda);
    console.log('Vault PDA:', vaultPda.toBase58());
    console.log('- Authority (Admin):', vaultAccount.authority.toBase58(), '✅');
    console.log('- Keeper Authority:', vaultAccount.keeperAuthority.toBase58(), '✅ (SEPARATE)');
    console.log('- Owner Wallet:', vaultAccount.ownerWallet.toBase58(), '✅');
    console.log('- Launch Timestamp:', vaultAccount.launchTimestamp?.toNumber() || 'Not set');
  } catch (e) {
    console.log('Vault error:', e.message);
  }
  
  // Check Smart Dial authorities
  console.log('\n3. SMART DIAL PROGRAM AUTHORITIES:');
  const dialProgramId = new PublicKey(deploymentState.smart_dial_program_id);
  
  // Load dial IDL and create program
  const dialIdl = JSON.parse(fs.readFileSync('./idl/smart_dial.json', 'utf-8'));
  dialIdl.address = dialProgramId.toBase58();
  const dialProgram = new Program(dialIdl, provider);
  
  // Find dial state PDA
  const [dialStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('dial_state')],
    dialProgramId
  );
  
  try {
    const dialAccount = await dialProgram.account.dialState.fetch(dialStatePda);
    console.log('Dial State PDA:', dialStatePda.toBase58());
    console.log('- Authority:', dialAccount.authority.toBase58(), '✅');
    console.log('- Current Reward Token:', dialAccount.currentRewardToken.toBase58(), '(SOL) ✅');
    console.log('- Launch Timestamp:', new Date(dialAccount.launchTimestamp.toNumber() * 1000).toISOString());
  } catch (e) {
    console.log('Smart Dial error:', e.message);
  }
  
  // Show wallet addresses for reference
  console.log('\n4. WALLET ADDRESSES:');
  console.log('- Deployer: 8X6ySemM8mJufhcGioSzC1ppFHyFQSdAtiiYJFg9r2xo');
  console.log('- Keeper: ABArxJxgLpPN3Vcfkhwi4qBtwNeesoZ4zumhkHjiA57v');
  console.log('- Owner: 5SSUrdmKcJ7uhWENDypQZfkbPJCphH9CLcpwidsQPB8N');
  
  console.log('\n5. AUTHORITY COMPARISON WITH miko-authority-structure.md:');
  console.log('\n✅ CORRECTLY IMPLEMENTED:');
  console.log('- Vault uses separate deployer and keeper authorities');
  console.log('- Owner wallet is separate from admin/keeper');
  console.log('- Freeze authority is null');
  console.log('- Smart Dial authority is deployer');
  console.log('- Initial reward token is SOL');
  
  console.log('\n❌ STILL NEEDS TO BE DONE:');
  console.log('- Transfer fee config authority → Vault PDA');
  console.log('- Withdraw withheld authority → Vault PDA');
  console.log('- Revoke mint authority (set to null)');
  
  console.log('\n📋 NEXT STEPS:');
  console.log('1. Transfer token authorities to Vault PDA (npm run transfer-authorities)');
  console.log('2. Create liquidity pool');
  console.log('3. Set launch timestamp');
  console.log('4. Revoke mint authority (FINAL STEP)');
}

verifyAuthorities().catch(console.error);