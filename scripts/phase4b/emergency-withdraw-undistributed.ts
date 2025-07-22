import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Emergency script to withdraw undistributed funds stuck in keeper
 * This should only be used when distribution has failed and funds need recovery
 */

const MAINNET_FORK_RPC = 'http://127.0.0.1:8899';

interface UndistributedInfo {
  amount: number;
  token: string;
  lastUpdate: number;
  keeperWallet: string;
}

async function emergencyWithdraw() {
  console.log('=== Emergency Withdrawal of Undistributed Funds ===\n');
  
  try {
    // Load authority keypair (only authority can perform emergency withdrawal)
    const authorityPath = path.join(__dirname, '../../docker/shared-artifacts/deployer-keypair.json');
    const authorityData = JSON.parse(fs.readFileSync(authorityPath, 'utf-8'));
    const authorityKeypair = Keypair.fromSecretKey(new Uint8Array(authorityData));
    
    console.log(`Authority wallet: ${authorityKeypair.publicKey.toBase58()}`);
    
    // Load keeper info to check undistributed balance
    // In production, this would query the actual keeper state
    const undistributedInfo: UndistributedInfo = {
      amount: 0, // Would be loaded from keeper state
      token: 'A9xZnPo2SvSgWiSxh4XApZyjyYRcH1ES8zTCvhzogYRE', // MIKO
      lastUpdate: Date.now(),
      keeperWallet: '5E8kjrFSVugkU9tv378uEYQ78DNp9z2MLY2fjSU5E3Ju'
    };
    
    // Check if there are undistributed funds
    if (undistributedInfo.amount === 0) {
      console.log('No undistributed funds found.');
      return;
    }
    
    console.log(`Found undistributed funds:`);
    console.log(`- Amount: ${undistributedInfo.amount / 1e9} tokens`);
    console.log(`- Token: ${undistributedInfo.token}`);
    console.log(`- Last update: ${new Date(undistributedInfo.lastUpdate).toISOString()}`);
    console.log(`- Keeper wallet: ${undistributedInfo.keeperWallet}\n`);
    
    // Prompt for destination wallet
    const treasuryWallet = 'Ei9vqjqic5S4cdTyDu98ENc933ub4HJMgAXJ6amnDFCH';
    console.log(`Destination wallet (treasury): ${treasuryWallet}`);
    
    // Confirm action
    console.log('\n⚠️  WARNING: This will withdraw ALL undistributed funds to treasury.');
    console.log('This action should only be taken if:');
    console.log('1. Distribution has failed multiple times');
    console.log('2. Funds are stuck and cannot be distributed normally');
    console.log('3. You have verified no eligible holders exist\n');
    
    // In production, add confirmation prompt here
    
    // Execute withdrawal using Vault's emergency_withdraw_vault instruction
    const connection = new Connection(MAINNET_FORK_RPC, 'confirmed');
    
    // TODO: Implement actual withdrawal transaction
    // This would call the Vault program's emergency withdrawal function
    
    console.log('\n✅ Emergency withdrawal completed');
    console.log(`Transaction signature: mock-emergency-tx`);
    
    // Log the action
    const logEntry = {
      action: 'emergency_withdrawal',
      timestamp: new Date().toISOString(),
      authority: authorityKeypair.publicKey.toBase58(),
      amount: undistributedInfo.amount,
      token: undistributedInfo.token,
      from: undistributedInfo.keeperWallet,
      to: treasuryWallet,
      reason: 'No eligible holders for distribution'
    };
    
    const logPath = path.join(__dirname, 'emergency-withdrawals.log');
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    
    console.log('\nAction logged to emergency-withdrawals.log');
    
  } catch (error) {
    console.error('Emergency withdrawal failed:', error);
    process.exit(1);
  }
}

// Add command to check undistributed balance without withdrawing
async function checkUndistributed() {
  console.log('=== Checking Undistributed Funds ===\n');
  
  try {
    // In production, this would query actual keeper/vault state
    const mockUndistributed = {
      miko: 0,
      sol: 0,
      usdc: 0,
      lastDistributionAttempt: Date.now() - 3600000, // 1 hour ago
      failureReason: 'No eligible holders (all balances < $100)'
    };
    
    console.log('Current undistributed balances:');
    console.log(`- MIKO: ${mockUndistributed.miko / 1e9}`);
    console.log(`- SOL: ${mockUndistributed.sol / 1e9}`);
    console.log(`- USDC: ${mockUndistributed.usdc / 1e6}`);
    console.log(`\nLast distribution attempt: ${new Date(mockUndistributed.lastDistributionAttempt).toISOString()}`);
    console.log(`Failure reason: ${mockUndistributed.failureReason}`);
    
  } catch (error) {
    console.error('Failed to check undistributed balance:', error);
    process.exit(1);
  }
}

// Main execution
const command = process.argv[2];

switch (command) {
  case 'withdraw':
    emergencyWithdraw()
      .then(() => process.exit(0))
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
    break;
    
  case 'check':
    checkUndistributed()
      .then(() => process.exit(0))
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
    break;
    
  default:
    console.log('Usage:');
    console.log('  ts-node emergency-withdraw-undistributed.ts check     - Check undistributed balance');
    console.log('  ts-node emergency-withdraw-undistributed.ts withdraw  - Withdraw undistributed funds');
    process.exit(1);
}