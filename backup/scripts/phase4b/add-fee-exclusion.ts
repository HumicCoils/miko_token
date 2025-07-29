import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';

async function main() {
  const connection = new Connection('http://localhost:8899', 'confirmed');
  
  // Load deployer (authority)
  const deployerData = JSON.parse(fs.readFileSync('./phase4b-deployer.json', 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  // Load wallet to add to exclusions
  const walletToAdd = new PublicKey('ABG9hkAVmeDREiw8FJCZCXDMcG1SxLypCUqmnvDaAK8q');
  
  // Load vault program
  const vaultIdl = JSON.parse(fs.readFileSync('./phase4b-vault-idl.json', 'utf-8'));
  const vaultProgramId = new PublicKey('9qPiWoJJdas55cMZqa8d62tVHP9hbYX6NwT34qbHe9pt');
  
  const provider = new AnchorProvider(
    connection,
    new Wallet(deployer),
    { commitment: 'confirmed' }
  );
  
  vaultIdl.address = vaultProgramId.toBase58();
  const vaultProgram = new Program(vaultIdl, provider);
  
  // Get vault PDA from init info
  const initInfo = JSON.parse(fs.readFileSync('./phase4b-init-info.json', 'utf-8'));
  const vaultPda = new PublicKey(initInfo.vault.pda);
  
  console.log('Adding wallet to fee exclusions...');
  console.log('Wallet:', walletToAdd.toBase58());
  console.log('Authority:', deployer.publicKey.toBase58());
  console.log('Vault PDA:', vaultPda.toBase58());
  
  try {
    const tx = await vaultProgram.methods
      .manageExclusions(
        { add: {} }, // ExclusionAction::Add
        { fee: {} }, // ExclusionListType::Fee
        walletToAdd
      )
      .accounts({
        vault: vaultPda,
        authority: deployer.publicKey,
      })
      .signers([deployer])
      .rpc();
    
    console.log('Success! Transaction:', tx);
    console.log('Wallet added to fee exclusions');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();