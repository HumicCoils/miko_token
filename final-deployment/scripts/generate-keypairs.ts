import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { getConfigManager } from './config-manager';

/**
 * Generate all required keypairs for deployment
 */
async function generateKeypairs() {
  console.log('=== Generate Keypairs ===\n');
  
  const configManager = getConfigManager();
  const network = configManager.getNetwork();
  
  console.log(`Network: ${network.toUpperCase()}\n`);
  
  // List of keypairs to generate
  const keypairs = [
    { name: 'deployer', description: 'Deployment and admin operations' },
    { name: 'owner', description: 'Receives 20% of tax' },
    { name: 'keeper', description: 'Bot operations (separate from deployer)' },
    { name: 'vault-program', description: 'Vault program ID' },
    { name: 'smart-dial-program', description: 'Smart Dial program ID' },
    { name: 'mint', description: 'Token mint (if needed)' }
  ];
  
  console.log('Generating keypairs...\n');
  
  for (const { name, description } of keypairs) {
    try {
      // Check if keypair already exists
      const keypair = configManager.loadKeypair(name);
      console.log(`✅ ${name}: ${keypair.publicKey.toBase58()} (existing)`);
      console.log(`   ${description}`);
    } catch {
      // Generate new keypair
      const keypair = Keypair.generate();
      configManager.saveKeypair(name, keypair);
      console.log(`✅ ${name}: ${keypair.publicKey.toBase58()} (new)`);
      console.log(`   ${description}`);
    }
    console.log();
  }
  
  // Important reminders
  console.log('\n⚠️  IMPORTANT REMINDERS:');
  console.log('1. Back up ALL keypairs to secure offline storage');
  console.log('2. Fund the deployer wallet with SOL:');
  console.log('   - Mainnet: ~15-20 SOL');
  console.log('   - Devnet: ~5 SOL');
  console.log('   - Local: Use local faucet');
  console.log('3. Keep deployer and keeper keypairs SEPARATE');
  console.log('4. Never commit keypairs to version control');
  
  if (network === 'mainnet') {
    console.log('\n🚨 MAINNET WARNING:');
    console.log('These keypairs will control real funds!');
    console.log('Store them securely and never share private keys.');
  }
}

// Run if called directly
if (require.main === module) {
  generateKeypairs()
    .then(() => {
      console.log('\n✅ Success!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Error:', err);
      process.exit(1);
    });
}