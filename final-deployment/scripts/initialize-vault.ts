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
const absoluteVaultIDL = JSON.parse(fs.readFileSync('./idl/absolute_vault.json', 'utf-8'));

/**
 * Initialize Vault program with separate authority and keeper_authority
 */
async function initializeVault() {
  console.log('=== Initialize Vault Program ===\n');
  
  const configManager = getConfigManager();
  const connection = configManager.getConnection();
  const network = configManager.getNetwork();
  
  console.log(`Network: ${network.toUpperCase()}`);
  console.log(`RPC: ${configManager.getRpcUrl()}\n`);
  
  // Load keypairs
  const deployer = configManager.loadKeypair('deployer');
  const owner = configManager.loadKeypair('owner');
  const keeper = configManager.loadKeypair('keeper');
  
  // Get program IDs and token mint
  const vaultProgramId = configManager.getVaultProgramId();
  const tokenMint = configManager.getTokenMint();
  const vaultConfig = configManager.getVaultConfig();
  
  console.log('Configuration:');
  console.log('- Deployer (Admin):', deployer.publicKey.toBase58());
  console.log('- Owner Wallet:', owner.publicKey.toBase58());
  console.log('- Keeper Authority:', keeper.publicKey.toBase58());
  console.log('- Token Mint:', tokenMint.toBase58());
  console.log('- Vault Program:', vaultProgramId.toBase58());
  console.log('- Min Hold Amount:', vaultConfig.minHoldAmount / 1e9, 'MIKO');
  console.log('- Harvest Threshold:', BigInt(vaultConfig.harvestThreshold) / BigInt(1e9), 'MIKO');
  
  // Create program interface
  const wallet = new NodeWallet(deployer);
  const provider = new AnchorProvider(
    connection,
    wallet,
    { commitment: configManager.getCommitment() }
  );
  
  // Set the program address on the IDL
  absoluteVaultIDL.address = vaultProgramId.toBase58();
  const program = new Program(absoluteVaultIDL, provider) as any;
  
  // Derive PDAs
  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), tokenMint.toBuffer()],
    vaultProgramId
  );
  
  const [poolRegistryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool_registry'), vaultPda.toBuffer()],
    vaultProgramId
  );
  
  console.log('\nPDAs:');
  console.log('- Vault PDA:', vaultPda.toBase58());
  console.log('- Pool Registry PDA:', poolRegistryPda.toBase58());
  
  // Check if already initialized
  try {
    const vaultAccount = await program.account.vaultState.fetch(vaultPda);
    console.log('\n⚠️  Vault already initialized!');
    console.log('Authority:', vaultAccount.authority.toBase58());
    console.log('Keeper Authority:', vaultAccount.keeperAuthority.toBase58());
    return { alreadyInitialized: true, vaultPda };
  } catch {
    // Not initialized, continue
  }
  
  // Initialize vault
  console.log('\n1. Initializing vault...');
  
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
    
    const initVaultIx = await program.methods
      .initialize(
        owner.publicKey,           // owner_wallet (receives 20%)
        keeper.publicKey,          // keeper_authority (SEPARATE from authority)
        new BN(vaultConfig.minHoldAmount)  // min_hold_amount
      )
      .accounts({
        vault: vaultPda,
        authority: deployer.publicKey,
        tokenMint: tokenMint,
        vaultProgram: vaultProgramId,
        payer: deployer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    
    tx.add(initVaultIx);
    
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [deployer],
      { commitment: configManager.getCommitment() }
    );
    
    console.log('✅ Vault initialized!');
    console.log('Signature:', sig);
    
    // Update deployment state
    configManager.updateDeploymentState({
      vault_initialized: true,
      vault_init_signature: sig
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize vault:', error);
    throw error;
  }
  
  // Initialize pool registry
  console.log('\n2. Initializing pool registry...');
  
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
    
    const initRegistryIx = await program.methods
      .initializePoolRegistry()
      .accounts({
        poolRegistry: poolRegistryPda,
        vault: vaultPda,
        payer: deployer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    
    tx.add(initRegistryIx);
    
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [deployer],
      { commitment: configManager.getCommitment() }
    );
    
    console.log('✅ Pool registry initialized!');
    console.log('Signature:', sig);
    
  } catch (error: any) {
    if (error.message?.includes('already in use')) {
      console.log('⚠️  Pool registry already initialized');
    } else {
      console.error('❌ Failed to initialize pool registry:', error);
      throw error;
    }
  }
  
  // Verify initialization
  console.log('\n3. Verifying initialization...');
  const vaultAccount = await program.account.vaultState.fetch(vaultPda);
  
  console.log('\n✅ Vault State:');
  console.log('- Authority:', vaultAccount.authority.toBase58());
  console.log('- Keeper Authority:', vaultAccount.keeperAuthority.toBase58());
  console.log('- Owner Wallet:', vaultAccount.ownerWallet.toBase58());
  console.log('- Token Mint:', vaultAccount.tokenMint.toBase58());
  console.log('- Min Hold Amount:', vaultAccount.minHoldAmount.toNumber() / 1e9, 'MIKO');
  console.log('- Harvest Threshold:', vaultAccount.harvestThreshold.toNumber() / 1e9, 'MIKO');
  console.log('- Launch Timestamp:', vaultAccount.launchTimestamp.toNumber());
  
  // Verify authority separation
  if (vaultAccount.authority.equals(vaultAccount.keeperAuthority)) {
    console.error('\n❌ CRITICAL ERROR: Authority and Keeper Authority are the same!');
    console.error('This violates security requirements. Please reinitialize with separate accounts.');
    throw new Error('Authority separation violation');
  }
  
  console.log('\n✅ Vault initialization complete!');
  console.log('\n📋 Summary:');
  console.log('- Admin Authority:', deployer.publicKey.toBase58());
  console.log('- Keeper Authority:', keeper.publicKey.toBase58(), '(SEPARATE ✓)');
  console.log('- Owner (20% recipient):', owner.publicKey.toBase58());
  console.log('- Vault PDA:', vaultPda.toBase58());
  
  return {
    vaultPda,
    poolRegistryPda,
    vaultBump
  };
}

// Run if called directly
if (require.main === module) {
  initializeVault()
    .then(() => {
      console.log('\n✅ Success!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Error:', err);
      process.exit(1);
    });
}