import {
  Connection,
  PublicKey,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SHARED_ARTIFACTS_PATH = '/shared-artifacts';

async function calculatePDAs() {
  console.log('Calculating PDAs for MIKO Token System');
  console.log('=========================================');
  console.log('');

  try {
    // Load token info
    const tokenInfoPath = path.join(SHARED_ARTIFACTS_PATH, 'token-info.json');
    const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf-8'));
    const mintPubkey = new PublicKey(tokenInfo.mint);
    console.log('Mint Address:', mintPubkey.toBase58());

    // Load program IDs
    const programsPath = path.join(SHARED_ARTIFACTS_PATH, 'programs.json');
    const programs = JSON.parse(fs.readFileSync(programsPath, 'utf-8'));
    const absoluteVaultProgram = new PublicKey(programs.absoluteVault.programId);
    const smartDialProgram = new PublicKey(programs.smartDial.programId);
    console.log('Absolute Vault Program:', absoluteVaultProgram.toBase58());
    console.log('Smart Dial Program:', smartDialProgram.toBase58());

    // Calculate Vault PDA
    console.log('');
    console.log('Calculating Vault PDA...');
    const [vaultPDA, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), mintPubkey.toBuffer()],
      absoluteVaultProgram
    );
    console.log('Vault PDA:', vaultPDA.toBase58());
    console.log('Vault Bump:', vaultBump);

    // Calculate Smart Dial State PDA
    console.log('');
    console.log('Calculating Smart Dial State PDA...');
    const [dialStatePDA, dialStateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('dial_state')],
      smartDialProgram
    );
    console.log('Dial State PDA:', dialStatePDA.toBase58());
    console.log('Dial State Bump:', dialStateBump);

    // Save PDA information
    const pdaInfo = {
      mint: mintPubkey.toBase58(),
      vault: {
        address: vaultPDA.toBase58(),
        bump: vaultBump,
        seeds: ['vault', mintPubkey.toBase58()],
        program: absoluteVaultProgram.toBase58()
      },
      dialState: {
        address: dialStatePDA.toBase58(),
        bump: dialStateBump,
        seeds: ['dial_state'],
        program: smartDialProgram.toBase58()
      },
      calculatedAt: new Date().toISOString()
    };

    const pdaPath = path.join(SHARED_ARTIFACTS_PATH, 'pdas.json');
    fs.writeFileSync(pdaPath, JSON.stringify(pdaInfo, null, 2));
    console.log('');
    console.log('PDA information saved to shared-artifacts/pdas.json');

    // Verify PDA calculation is deterministic
    console.log('');
    console.log('Verifying PDA calculation determinism...');
    
    // Recalculate to ensure determinism
    const [vaultPDA2, vaultBump2] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), mintPubkey.toBuffer()],
      absoluteVaultProgram
    );
    
    const [dialStatePDA2, dialStateBump2] = PublicKey.findProgramAddressSync(
      [Buffer.from('dial_state')],
      smartDialProgram
    );

    const deterministic = 
      vaultPDA.equals(vaultPDA2) && 
      vaultBump === vaultBump2 &&
      dialStatePDA.equals(dialStatePDA2) &&
      dialStateBump === dialStateBump2;

    // VC:3.PDA_CALCULATION verification
    const vc3PDACalculation = {
      vc_id: 'VC:3.PDA_CALCULATION',
      description: 'Verify PDA calculation is deterministic',
      observed: {
        vaultPDA: {
          firstCalculation: vaultPDA.toBase58(),
          secondCalculation: vaultPDA2.toBase58(),
          bump: vaultBump,
          seeds: ['vault', mintPubkey.toBase58()],
          program: absoluteVaultProgram.toBase58()
        },
        dialStatePDA: {
          firstCalculation: dialStatePDA.toBase58(),
          secondCalculation: dialStatePDA2.toBase58(),
          bump: dialStateBump,
          seeds: ['dial_state'],
          program: smartDialProgram.toBase58()
        }
      },
      expected: {
        allCalculationsMatch: true,
        bumpsConsistent: true
      },
      passed: deterministic,
      checked_at: new Date().toISOString(),
      notes: deterministic 
        ? 'PDA calculations are deterministic and consistent'
        : 'PDA calculations are not deterministic - CRITICAL ERROR'
    };

    // Create verification directory if it doesn't exist
    const verificationDir = path.join(SHARED_ARTIFACTS_PATH, 'verification');
    if (!fs.existsSync(verificationDir)) {
      fs.mkdirSync(verificationDir, { recursive: true });
    }

    // Save verification result
    fs.writeFileSync(
      path.join(verificationDir, 'vc3-pda-calculation.json'),
      JSON.stringify(vc3PDACalculation, null, 2)
    );

    console.log('');
    console.log('VC:3.PDA_CALCULATION Result:');
    console.log('================================');
    console.log('Status: ' + (deterministic ? 'PASSED' : 'FAILED'));
    console.log('Details:', vc3PDACalculation.notes);

    if (!deterministic) {
      console.error('');
      console.error('CRITICAL: PDA calculation is not deterministic!');
      process.exit(1);
    }

    // Display summary
    console.log('');
    console.log('PDA Summary:');
    console.log('================');
    console.log('Vault PDA: ' + vaultPDA.toBase58());
    console.log('  - Seeds: vault + ' + mintPubkey.toBase58());
    console.log('  - Bump: ' + vaultBump);
    console.log('');
    console.log('Dial State PDA: ' + dialStatePDA.toBase58());
    console.log('  - Seeds: dial_state');
    console.log('  - Bump: ' + dialStateBump);

    console.log('');
    console.log('PDA calculation complete and verified!');

  } catch (error) {
    console.error('');
    console.error('Error calculating PDAs:', error);
    process.exit(1);
  }
}

// Run calculation
calculatePDAs().catch(console.error);