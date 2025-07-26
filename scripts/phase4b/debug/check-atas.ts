import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { 
  getAssociatedTokenAddressSync, 
  getAccount, 
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT
} from '@solana/spl-token';
import * as fs from 'fs';
import { ConfigManager } from '../config-manager';

async function checkATAs() {
  // Use ConfigManager to get auto-derived configuration
  const configManager = new ConfigManager('./minimal-config.json');
  const config = await configManager.getFullConfig();
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  
  // Load deployer
  const deployerData = JSON.parse(fs.readFileSync('./phase4b-deployer.json', 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  const mikoMint = new PublicKey(config.token.mint_address);
  
  console.log('Checking ATAs for deployer:', deployer.publicKey.toBase58());
  console.log('');
  
  // Check MIKO ATA (Token-2022)
  const mikoAta = getAssociatedTokenAddressSync(
    mikoMint,
    deployer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  console.log('MIKO ATA (Token-2022):', mikoAta.toBase58());
  try {
    const mikoAccount = await getAccount(connection, mikoAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('- Balance:', (mikoAccount.amount / BigInt(10 ** 9)).toString(), 'MIKO');
    console.log('- Owner:', mikoAccount.owner.toBase58());
    console.log('- Mint:', mikoAccount.mint.toBase58());
  } catch (e: any) {
    console.log('- Error:', e.message);
  }
  
  console.log('');
  
  // Check WSOL ATA (Token Program)
  const wsolAta = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    deployer.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );
  
  console.log('WSOL ATA (Token Program):', wsolAta.toBase58());
  try {
    const wsolAccount = await getAccount(connection, wsolAta, 'confirmed', TOKEN_PROGRAM_ID);
    console.log('- Balance:', (wsolAccount.amount / BigInt(10 ** 9)).toString(), 'SOL');
    console.log('- Owner:', wsolAccount.owner.toBase58());
    console.log('- Mint:', wsolAccount.mint.toBase58());
  } catch (e: any) {
    console.log('- Error:', e.message);
  }
  
  console.log('');
  
  // Check native SOL balance
  const solBalance = await connection.getBalance(deployer.publicKey);
  console.log('Native SOL balance:', solBalance / 1e9, 'SOL');
}

checkATAs().catch(console.error);