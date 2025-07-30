import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { getConfigManager } from './config-manager';
import * as fs from 'fs';

// Load IDL from file
const smartDialIDL = JSON.parse(fs.readFileSync('./idl/smart_dial.json', 'utf-8'));

/**
 * Initialize Smart Dial program
 */
async function initializeSmartDial() {
  console.log('=== Initialize Smart Dial Program ===\n');
  
  const configManager = getConfigManager();
  const connection = configManager.getConnection();
  const network = configManager.getNetwork();
  
  console.log(`Network: ${network.toUpperCase()}`);
  console.log(`RPC: ${configManager.getRpcUrl()}\n`);
  
  // Load deployer keypair
  const deployer = configManager.loadKeypair('deployer');
  
  // Get program ID
  const smartDialProgramId = configManager.getSmartDialProgramId();
  
  console.log('Configuration:');
  console.log('- Deployer (Authority):', deployer.publicKey.toBase58());
  console.log('- Smart Dial Program:', smartDialProgramId.toBase58());
  
  // Create program interface
  const wallet = new NodeWallet(deployer);
  const provider = new AnchorProvider(
    connection,
    wallet,
    { commitment: configManager.getCommitment() }
  );
  
  // Set the program address on the IDL
  smartDialIDL.address = smartDialProgramId.toBase58();
  const program = new Program(smartDialIDL, provider) as any;
  
  // Derive PDA
  const [dialStatePda, dialBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('dial_state')],
    smartDialProgramId
  );
  
  console.log('\nSmart Dial PDA:', dialStatePda.toBase58());
  
  // Check if already initialized
  try {
    const dialAccount = await program.account.dialState.fetch(dialStatePda);
    console.log('\n⚠️  Smart Dial already initialized!');
    console.log('Authority:', dialAccount.authority.toBase58());
    console.log('Current Reward Token:', dialAccount.currentRewardToken.toBase58());
    console.log('Launch Timestamp:', new Date(dialAccount.launchTimestamp.toNumber() * 1000).toISOString());
    return { alreadyInitialized: true, dialStatePda };
  } catch {
    // Not initialized, continue
  }
  
  // Get launch timestamp (use current time for initialization)
  const launchTimestamp = Math.floor(Date.now() / 1000);
  
  console.log('\nInitializing Smart Dial...');
  console.log('Launch Timestamp:', new Date(launchTimestamp * 1000).toISOString());
  
  try {
    const tx = new Transaction();
    
    if (network === 'mainnet') {
      const priorityFee = configManager.getPriorityFee();
      tx.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee.microLamports,
        })
      );
    }
    
    const initDialIx = await program.methods
      .initialize(new BN(launchTimestamp))
      .accounts({
        dialState: dialStatePda,
        authority: deployer.publicKey,
        payer: deployer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    
    tx.add(initDialIx);
    
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [deployer],
      { commitment: configManager.getCommitment() }
    );
    
    console.log('✅ Smart Dial initialized!');
    console.log('Signature:', sig);
    
    // Update deployment state
    configManager.updateDeploymentState({
      smart_dial_initialized: true,
      smart_dial_init_signature: sig
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize smart dial:', error);
    throw error;
  }
  
  // Verify initialization
  console.log('\nVerifying initialization...');
  const dialAccount = await program.account.dialState.fetch(dialStatePda);
  
  console.log('\n✅ Smart Dial State:');
  console.log('- Authority:', dialAccount.authority.toBase58());
  console.log('- Current Reward Token:', dialAccount.currentRewardToken.toBase58());
  console.log('- Launch Timestamp:', new Date(dialAccount.launchTimestamp.toNumber() * 1000).toISOString());
  console.log('- Last Update:', dialAccount.lastUpdate.toNumber());
  console.log('- Update Count:', dialAccount.updateCount.toNumber());
  
  // Calculate first Monday
  const firstMonday = calculateFirstMonday(dialAccount.launchTimestamp.toNumber());
  console.log('- First Update Available:', new Date(firstMonday * 1000).toISOString());
  
  console.log('\n✅ Smart Dial initialization complete!');
  console.log('\n📋 Summary:');
  console.log('- Initial Reward Token: SOL');
  console.log('- Updates Available: After first Monday following launch');
  console.log('- Update Cooldown: 24 hours');
  
  return {
    dialStatePda,
    dialBump,
    launchTimestamp
  };
}

// Helper function to calculate first Monday after launch
function calculateFirstMonday(launchTimestamp: number): number {
  const launchDays = Math.floor(launchTimestamp / (24 * 60 * 60));
  const launchDayOfWeek = ((launchDays + 4) % 7);
  
  const daysUntilMonday = launchDayOfWeek === 4 ? 7 :
    launchDayOfWeek < 4 ? 4 - launchDayOfWeek :
    11 - launchDayOfWeek;
  
  return launchTimestamp + (daysUntilMonday * 24 * 60 * 60);
}


// Run if called directly
if (require.main === module) {
  initializeSmartDial()
    .then(() => {
      console.log('\n✅ Success!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Error:', err);
      process.exit(1);
    });
}