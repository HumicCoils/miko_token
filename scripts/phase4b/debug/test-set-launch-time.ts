import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import * as fs from 'fs';
import * as path from 'path';

async function testSetLaunchTime() {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  // Load deployer
  const deployerData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'phase4b-deployer.json'), 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  // Load configurations
  const vaultIdl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'phase4b-vault-idl.json'), 'utf-8'));
  const initInfo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'phase4b-init-info.json'), 'utf-8'));
  
  // Create provider
  const wallet = new NodeWallet(deployer);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const vaultProgram = new Program(vaultIdl, provider);
  
  // Use the vault PDA from initialization
  const vaultPda = new PublicKey(initInfo.vault.pda);
  
  console.log('Setting launch time...');
  console.log('Vault PDA:', vaultPda.toBase58());
  console.log('Authority:', deployer.publicKey.toBase58());
  
  const timestamp = Math.floor(Date.now() / 1000);
  console.log('Timestamp:', timestamp);
  
  try {
    // Call set_launch_time with the timestamp
    const tx = await vaultProgram.methods
      .setLaunchTime(new BN(timestamp))
      .accounts({
        vault: vaultPda,
        authority: deployer.publicKey,
      })
      .rpc();
    
    console.log('✅ Launch time set! Tx:', tx);
    console.log('Launch time:', new Date(timestamp * 1000).toISOString());
  } catch (error: any) {
    console.error('Error setting launch time:', error);
    if (error.logs) {
      console.error('Program logs:', error.logs);
    }
  }
}

testSetLaunchTime().catch(console.error);