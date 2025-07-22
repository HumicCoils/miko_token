import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import * as fs from 'fs';

const FORK_URL = 'http://127.0.0.1:8899';

// Load configurations
const config = JSON.parse(fs.readFileSync('phase4b-config.json', 'utf-8'));
const initInfo = JSON.parse(fs.readFileSync('phase4b-init-info.json', 'utf-8'));
const walletInfo = JSON.parse(fs.readFileSync('phase4b-wallet-recovery.json', 'utf-8'));
const smartDialIdl = JSON.parse(fs.readFileSync('phase4b-smart-dial-idl.json', 'utf-8'));

async function updateSmartDialTreasury() {
  const connection = new Connection(FORK_URL, 'confirmed');
  
  // Load deployer (authority)
  const deployerData = JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  // Create provider
  const wallet = new NodeWallet(deployer);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const smartDialProgram = new Program(smartDialIdl, provider);
  
  const dialStatePda = new PublicKey(initInfo.smartDial.pda);
  
  console.log('Updating Smart Dial treasury...');
  console.log('Current authority:', deployer.publicKey.toBase58());
  
  // Get current dial state
  const dialState = await (smartDialProgram.account as any).dialState.fetch(dialStatePda);
  console.log('\nCurrent Smart Dial State:');
  console.log('- Authority:', dialState.authority.toBase58());
  console.log('- Treasury:', dialState.treasury.toBase58());
  console.log('- Reward Token:', dialState.currentRewardToken.toBase58());
  
  // Treasury should match Vault's ownerWallet (Phase 3 pattern)
  const newTreasury = new PublicKey(walletInfo.wallets.owner.publicKey);
  
  console.log('\nUpdating to:');
  console.log('- New Treasury:', newTreasury.toBase58(), '(matches Vault ownerWallet)');
  
  try {
    const tx = await smartDialProgram.methods
      .updateTreasury(newTreasury)
      .accounts({
        dialState: dialStatePda,
        authority: deployer.publicKey,
      })
      .rpc();
    
    console.log('\n✓ Smart Dial treasury updated! Tx:', tx);
    
    // Verify update
    const updatedDialState = await (smartDialProgram.account as any).dialState.fetch(dialStatePda);
    console.log('\nUpdated Smart Dial State:');
    console.log('- Authority:', updatedDialState.authority.toBase58());
    console.log('- Treasury:', updatedDialState.treasury.toBase58());
    console.log('- Reward Token:', updatedDialState.currentRewardToken.toBase58());
    
  } catch (error) {
    console.error('Failed to update smart dial treasury:', error);
  }
}

updateSmartDialTreasury().catch(console.error);