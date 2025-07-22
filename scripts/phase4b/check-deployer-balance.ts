import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';

const FORK_URL = 'http://127.0.0.1:8899';

async function checkBalance() {
  const connection = new Connection(FORK_URL, 'confirmed');
  
  // Load config
  const config = JSON.parse(fs.readFileSync('phase4b-config.json', 'utf-8'));
  
  const deployer = new PublicKey(config.deployer);
  const mikoMint = new PublicKey(config.mikoToken);
  const deployerAta = new PublicKey(config.deployerAta);
  
  console.log('Checking deployer balances...');
  console.log('Deployer:', deployer.toBase58());
  console.log('MIKO Token:', mikoMint.toBase58());
  console.log('Deployer ATA:', deployerAta.toBase58());
  
  // Check SOL balance
  const solBalance = await connection.getBalance(deployer);
  console.log('\nSOL Balance:', (solBalance / 1e9).toFixed(4), 'SOL');
  
  // Check MIKO balance
  try {
    const tokenAccount = await getAccount(
      connection,
      deployerAta,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    
    const mikoBalance = Number(tokenAccount.amount) / 1e9;
    console.log('MIKO Balance:', mikoBalance.toLocaleString(), 'MIKO');
    console.log('MIKO Balance (M):', (mikoBalance / 1e6).toFixed(0), 'M MIKO');
    
    // Check requirements
    console.log('\nLaunch Requirements:');
    console.log('- Need 11 SOL (10 + fees):', solBalance / 1e9 >= 11 ? '✅' : '❌');
    console.log('- Need 900M MIKO:', mikoBalance >= 900_000_000 ? '✅' : '❌');
    
  } catch (error) {
    console.error('Failed to get MIKO balance:', error);
  }
}

checkBalance().catch(console.error);