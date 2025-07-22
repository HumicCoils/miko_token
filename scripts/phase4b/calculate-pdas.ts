import { PublicKey } from '@solana/web3.js';
import { readFileSync } from 'fs';
import * as path from 'path';

async function calculatePDAs() {
  // Load config
  const config = JSON.parse(readFileSync(path.join(__dirname, 'phase4b-config.json'), 'utf-8'));
  
  // Calculate Vault PDA
  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), new PublicKey(config.mikoToken).toBuffer()],
    new PublicKey(config.programs.vault)
  );
  
  // Calculate Smart Dial PDA
  const [dialStatePda, dialBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('smart-dial')],
    new PublicKey(config.programs.smartDial)
  );
  
  console.log('PDAs:');
  console.log('Vault PDA:', vaultPda.toString());
  console.log('Vault Bump:', vaultBump);
  console.log('Smart Dial PDA:', dialStatePda.toString());
  console.log('Smart Dial Bump:', dialBump);
}

calculatePDAs();