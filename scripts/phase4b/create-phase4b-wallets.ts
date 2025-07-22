import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';

// Create the proper wallet structure for Phase 4-B testing
// EXACTLY like Phase 3 did it!

async function createPhase4BWallets() {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  // Load deployer to fund the new wallets
  const deployerData = JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  console.log('Creating Phase 4-B wallet structure (like Phase 3)...\n');
  
  // Create wallets
  const wallets = {
    owner: Keypair.generate(),      // Receives 20% of tax
    treasury: Keypair.generate(),   // Holds 80% for distribution
    keeper: Keypair.generate(),     // Bot operations
  };
  
  // Save keypairs
  fs.writeFileSync('phase4b-owner-keypair.json', JSON.stringify(Array.from(wallets.owner.secretKey)));
  fs.writeFileSync('phase4b-treasury-keypair.json', JSON.stringify(Array.from(wallets.treasury.secretKey)));
  fs.writeFileSync('phase4b-keeper-keypair.json', JSON.stringify(Array.from(wallets.keeper.secretKey)));
  
  // Fund the wallets with some SOL for operations
  console.log('Funding wallets...');
  
  for (const [name, wallet] of Object.entries(wallets)) {
    try {
      const sig = await connection.requestAirdrop(wallet.publicKey, 5 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
      console.log(`✓ Funded ${name} wallet: ${wallet.publicKey.toBase58()}`);
    } catch (error) {
      console.error(`Failed to fund ${name} wallet:`, error);
    }
  }
  
  // Create wallet info file (like Phase 3's MIKO_WALLET_RECOVERY.json)
  const walletInfo = {
    description: 'Phase 4-B Test Wallets',
    createdAt: new Date().toISOString(),
    wallets: {
      authority: {
        publicKey: deployer.publicKey.toBase58(),
        note: 'Overall management (uses deployer for Phase 4-B)'
      },
      owner: {
        publicKey: wallets.owner.publicKey.toBase58(),
        privateKey: Array.from(wallets.owner.secretKey),
        note: 'Receives 20% of tax revenue'
      },
      treasury: {
        publicKey: wallets.treasury.publicKey.toBase58(),
        privateKey: Array.from(wallets.treasury.secretKey),
        note: 'Holds 80% for distribution to holders'
      },
      keeper: {
        publicKey: wallets.keeper.publicKey.toBase58(),
        privateKey: Array.from(wallets.keeper.secretKey),
        note: 'Keeper bot authority'
      },
    },
  };
  
  fs.writeFileSync('phase4b-wallet-recovery.json', JSON.stringify(walletInfo, null, 2));
  
  console.log('\nPhase 4-B Wallet Structure Created:');
  console.log('- Authority:', deployer.publicKey.toBase58(), '(deployer)');
  console.log('- Owner:', wallets.owner.publicKey.toBase58(), '(20% tax recipient)');
  console.log('- Treasury:', wallets.treasury.publicKey.toBase58(), '(80% distribution pool)');
  console.log('- Keeper:', wallets.keeper.publicKey.toBase58(), '(bot operations)');
  console.log('\nWallet recovery info saved to phase4b-wallet-recovery.json');
}

createPhase4BWallets().catch(console.error);