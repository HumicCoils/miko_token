import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import * as fs from 'fs';

const FORK_URL = 'http://127.0.0.1:8899';

// Load configurations
const config = JSON.parse(fs.readFileSync('phase4b-config.json', 'utf-8'));
const initInfo = JSON.parse(fs.readFileSync('phase4b-init-info.json', 'utf-8'));
const walletInfo = JSON.parse(fs.readFileSync('phase4b-wallet-recovery.json', 'utf-8'));
const vaultIdl = JSON.parse(fs.readFileSync('phase4b-vault-idl.json', 'utf-8'));

async function updateVaultConfig() {
  const connection = new Connection(FORK_URL, 'confirmed');
  
  // Load deployer (authority)
  const deployerData = JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  // Create provider
  const wallet = new NodeWallet(deployer);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const vaultProgram = new Program(vaultIdl, provider);
  
  const vaultPda = new PublicKey(initInfo.vault.pda);
  
  console.log('Updating Vault configuration...');
  console.log('Current authority:', deployer.publicKey.toBase58());
  
  // Get current vault state
  const vaultState = await (vaultProgram.account as any).vaultState.fetch(vaultPda);
  console.log('\nCurrent Vault State:');
  console.log('- Treasury:', vaultState.treasury.toBase58());
  console.log('- Owner Wallet:', vaultState.ownerWallet.toBase58());
  console.log('- Keeper Authority:', vaultState.keeperAuthority.toBase58(), '(CANNOT be changed)');
  
  // Update vault config with proper wallets
  const newTreasury = new PublicKey(walletInfo.wallets.treasury.publicKey);
  const newOwnerWallet = new PublicKey(walletInfo.wallets.owner.publicKey);
  
  console.log('\nUpdating to:');
  console.log('- New Treasury:', newTreasury.toBase58());
  console.log('- New Owner Wallet:', newOwnerWallet.toBase58());
  
  try {
    const tx = await vaultProgram.methods
      .updateConfig(
        newTreasury,        // new_treasury
        newOwnerWallet,     // new_owner_wallet
        null,               // min_hold_amount (no change)
        null                // harvest_threshold (no change)
      )
      .accounts({
        vault: vaultPda,
        authority: deployer.publicKey,
      })
      .rpc();
    
    console.log('\n✓ Vault configuration updated! Tx:', tx);
    
    // Verify update
    const updatedVaultState = await (vaultProgram.account as any).vaultState.fetch(vaultPda);
    console.log('\nUpdated Vault State:');
    console.log('- Treasury:', updatedVaultState.treasury.toBase58());
    console.log('- Owner Wallet:', updatedVaultState.ownerWallet.toBase58());
    console.log('- Keeper Authority:', updatedVaultState.keeperAuthority.toBase58(), '(unchanged)');
    
    // Note the architectural limitation
    if (updatedVaultState.keeperAuthority.equals(deployer.publicKey)) {
      console.log('\n⚠️  NOTE: Keeper authority is still deployer (architectural limitation)');
      console.log('    This cannot be changed after initialization.');
    }
    
  } catch (error) {
    console.error('Failed to update vault config:', error);
  }
}

updateVaultConfig().catch(console.error);