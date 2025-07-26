import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, getAccount, NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

async function checkWsolAta() {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  // Load deployer
  const deployerData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'phase4b-deployer.json'), 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  console.log('Deployer:', deployer.publicKey.toBase58());
  console.log('Checking WSOL ATA...');
  
  // Get WSOL ATA address
  const wsolAta = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    deployer.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );
  
  console.log('WSOL ATA address:', wsolAta.toBase58());
  
  try {
    const account = await getAccount(connection, wsolAta, 'confirmed', TOKEN_PROGRAM_ID);
    console.log('WSOL ATA exists!');
    console.log('Balance:', Number(account.amount) / 1e9, 'SOL');
  } catch (error) {
    console.log('WSOL ATA does not exist');
  }
  
  // Check SOL balance
  const solBalance = await connection.getBalance(deployer.publicKey);
  console.log('SOL balance:', solBalance / 1e9, 'SOL');
}

checkWsolAta().catch(console.error);