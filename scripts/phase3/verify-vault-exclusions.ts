import {
  Connection,
  PublicKey,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SHARED_ARTIFACTS_PATH = '/shared-artifacts';

// VaultState structure based on IDL
interface VaultState {
  authority: PublicKey;
  treasury: PublicKey;
  ownerWallet: PublicKey;
  tokenMint: PublicKey;
  minHoldAmount: bigint;
  feeExclusions: PublicKey[];
  rewardExclusions: PublicKey[];
  keeperAuthority: PublicKey;
  launchTimestamp: bigint;
  feeFinalized: boolean;
  harvestThreshold: bigint;
}

// Helper function to read PublicKey from buffer
function readPublicKey(buffer: Buffer, offset: number): PublicKey {
  return new PublicKey(buffer.slice(offset, offset + 32));
}

// Helper function to read u64 from buffer (little-endian)
function readU64(buffer: Buffer, offset: number): bigint {
  const low = buffer.readUInt32LE(offset);
  const high = buffer.readUInt32LE(offset + 4);
  return BigInt(low) + (BigInt(high) << 32n);
}

// Helper function to read Vec<Pubkey>
function readPubkeyVec(buffer: Buffer, offset: number): { keys: PublicKey[], bytesRead: number } {
  // Read length (u32)
  const length = buffer.readUInt32LE(offset);
  const keys: PublicKey[] = [];
  let currentOffset = offset + 4;

  for (let i = 0; i < length; i++) {
    keys.push(readPublicKey(buffer, currentOffset));
    currentOffset += 32;
  }

  return { keys, bytesRead: 4 + (length * 32) };
}

async function verifyVaultExclusions() {
  console.log('🔍 Verifying Vault Auto-Exclusions');
  console.log('===================================');
  console.log('');

  try {
    // Load initialization info
    const initInfoPath = path.join(SHARED_ARTIFACTS_PATH, 'vault-init-info.json');
    const initInfo = JSON.parse(fs.readFileSync(initInfoPath, 'utf-8'));
    
    // Load PDAs
    const pdaPath = path.join(SHARED_ARTIFACTS_PATH, 'pdas.json');
    const pdas = JSON.parse(fs.readFileSync(pdaPath, 'utf-8'));
    const vaultPDA = new PublicKey(pdas.vault.address);
    
    // Load programs
    const programsPath = path.join(SHARED_ARTIFACTS_PATH, 'programs.json');
    const programs = JSON.parse(fs.readFileSync(programsPath, 'utf-8'));
    const vaultProgram = new PublicKey(programs.absoluteVault.programId);

    console.log('Vault PDA:', vaultPDA.toBase58());
    console.log('Vault Program:', vaultProgram.toBase58());

    // Create connection
    const connection = new Connection(RPC_URL, 'confirmed');

    // Fetch vault account
    console.log('');
    console.log('Fetching vault account data...');
    const vaultAccountInfo = await connection.getAccountInfo(vaultPDA);
    
    if (!vaultAccountInfo) {
      console.error('❌ Vault account not found!');
      process.exit(1);
    }

    // Skip the 8-byte discriminator
    const data = vaultAccountInfo.data.slice(8);
    
    // Parse VaultState
    console.log('Parsing vault state...');
    let offset = 0;
    
    // Read fixed fields
    const authority = readPublicKey(data, offset); offset += 32;
    const treasury = readPublicKey(data, offset); offset += 32;
    const ownerWallet = readPublicKey(data, offset); offset += 32;
    const tokenMint = readPublicKey(data, offset); offset += 32;
    const minHoldAmount = readU64(data, offset); offset += 8;
    
    // Read fee_exclusions Vec
    const feeExclusionsResult = readPubkeyVec(data, offset);
    const feeExclusions = feeExclusionsResult.keys;
    offset += feeExclusionsResult.bytesRead;
    
    // Read reward_exclusions Vec
    const rewardExclusionsResult = readPubkeyVec(data, offset);
    const rewardExclusions = rewardExclusionsResult.keys;
    offset += rewardExclusionsResult.bytesRead;
    
    // Read remaining fields
    const keeperAuthority = readPublicKey(data, offset); offset += 32;
    const launchTimestamp = readU64(data, offset); offset += 8;
    const feeFinalized = data[offset] !== 0; offset += 1;
    const harvestThreshold = readU64(data, offset); offset += 8;

    console.log('');
    console.log('Vault State Parsed:');
    console.log('==================');
    console.log('Authority:', authority.toBase58());
    console.log('Treasury:', treasury.toBase58());
    console.log('Owner Wallet:', ownerWallet.toBase58());
    console.log('Token Mint:', tokenMint.toBase58());
    console.log('Keeper Authority:', keeperAuthority.toBase58());
    console.log('Fee Exclusions Count:', feeExclusions.length);
    console.log('Reward Exclusions Count:', rewardExclusions.length);

    // Expected auto-excluded accounts
    const expectedExclusions = [
      { name: 'Owner Wallet', address: ownerWallet },
      { name: 'Treasury', address: treasury },
      { name: 'Keeper Authority', address: keeperAuthority },
      { name: 'Vault Program', address: vaultProgram },
      { name: 'Vault PDA', address: vaultPDA },
    ];

    console.log('');
    console.log('Checking Fee Exclusions:');
    console.log('========================');
    let allFeeExclusionsPresent = true;
    const feeExclusionStrings = feeExclusions.map(k => k.toBase58());
    
    for (const expected of expectedExclusions) {
      const isPresent = feeExclusionStrings.includes(expected.address.toBase58());
      console.log(`${expected.name}: ${isPresent ? '✅' : '❌'} ${expected.address.toBase58()}`);
      if (!isPresent) allFeeExclusionsPresent = false;
    }

    console.log('');
    console.log('Checking Reward Exclusions:');
    console.log('===========================');
    let allRewardExclusionsPresent = true;
    const rewardExclusionStrings = rewardExclusions.map(k => k.toBase58());
    
    for (const expected of expectedExclusions) {
      const isPresent = rewardExclusionStrings.includes(expected.address.toBase58());
      console.log(`${expected.name}: ${isPresent ? '✅' : '❌'} ${expected.address.toBase58()}`);
      if (!isPresent) allRewardExclusionsPresent = false;
    }

    // VC:3.VAULT_EXCLUSIONS verification
    const vc3VaultExclusions = {
      vc_id: 'VC:3.VAULT_EXCLUSIONS',
      description: 'Verify all 5 system accounts are auto-excluded in both lists',
      observed: {
        feeExclusions: feeExclusions.map(k => k.toBase58()),
        rewardExclusions: rewardExclusions.map(k => k.toBase58()),
        feeExclusionCount: feeExclusions.length,
        rewardExclusionCount: rewardExclusions.length,
      },
      expected: {
        requiredAccounts: expectedExclusions.map(e => ({
          name: e.name,
          address: e.address.toBase58(),
        })),
        allInFeeExclusions: true,
        allInRewardExclusions: true,
      },
      passed: allFeeExclusionsPresent && allRewardExclusionsPresent,
      checked_at: new Date().toISOString(),
      notes: allFeeExclusionsPresent && allRewardExclusionsPresent
        ? 'All 5 system accounts are properly auto-excluded in both lists'
        : 'Some system accounts are missing from exclusion lists',
    };

    // Save verification result
    const verificationDir = path.join(SHARED_ARTIFACTS_PATH, 'verification');
    fs.writeFileSync(
      path.join(verificationDir, 'vc3-vault-exclusions.json'),
      JSON.stringify(vc3VaultExclusions, null, 2)
    );

    console.log('');
    console.log('📊 VC:3.VAULT_EXCLUSIONS Result:');
    console.log('=================================');
    console.log('Status:', vc3VaultExclusions.passed ? '✅ PASSED' : '❌ FAILED');
    console.log('Details:', vc3VaultExclusions.notes);

    if (!vc3VaultExclusions.passed) {
      console.error('');
      console.error('❌ CRITICAL: Vault exclusions verification failed!');
      console.error('Some system accounts are not properly excluded.');
      process.exit(1);
    }

    console.log('');
    console.log('✅ Vault exclusions verification complete!');
    console.log('All system accounts are properly auto-excluded.');

  } catch (error) {
    console.error('');
    console.error('❌ Error verifying vault exclusions:', error);
    process.exit(1);
  }
}

// Run verification
verifyVaultExclusions().catch(console.error);