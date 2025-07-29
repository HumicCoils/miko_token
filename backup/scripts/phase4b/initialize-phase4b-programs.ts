import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { NATIVE_MINT } from '@solana/spl-token';
import * as fs from 'fs';
import { ConfigManager } from './config-manager';

// Import Phase 4-B IDLs
const vaultIdl = JSON.parse(fs.readFileSync('phase4b-vault-idl.json', 'utf-8'));
const smartDialIdl = JSON.parse(fs.readFileSync('phase4b-smart-dial-idl.json', 'utf-8'));

async function initializePrograms() {
  // Use ConfigManager to get auto-derived configuration
  const configManager = new ConfigManager('./minimal-config.json');
  const config = await configManager.getFullConfig();
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  
  // Load deployer keypair
  const deployerData = JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  // Create wallet and provider
  const wallet = new NodeWallet(deployer);
  const provider = new AnchorProvider(
    connection,
    wallet,
    { commitment: 'confirmed' }
  );
  
  console.log('Initializing Phase 4-B programs...');
  console.log('Deployer:', deployer.publicKey.toBase58());
  console.log('MIKO Token:', config.token.mint_address);
  console.log('Vault Program:', config.programs.vault_program_id);
  console.log('Smart Dial Program:', config.programs.smart_dial_program_id);
  
  // Calculate PDAs
  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), new PublicKey(config.token.mint_address).toBuffer()],
    new PublicKey(config.programs.vault_program_id)
  );
  
  const [dialStatePda, dialBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('smart-dial')],
    new PublicKey(config.programs.smart_dial_program_id)
  );
  
  console.log('\nPDAs calculated:');
  console.log('Vault PDA:', vaultPda.toBase58(), 'bump:', vaultBump);
  console.log('Dial State PDA:', dialStatePda.toBase58(), 'bump:', dialBump);
  
  // Initialize Vault
  console.log('\nInitializing Vault...');
  vaultIdl.address = config.programs.vault_program_id;
  const vaultProgram = new Program(vaultIdl, provider);
  
  try {
    const vaultTx = await vaultProgram.methods
      .initialize(
        deployer.publicKey,     // authority (will be updated later)
        deployer.publicKey,     // ownerWallet (will be updated later)
        deployer.publicKey,     // keeperAuthority (will be updated later)
        new BN(100_000_000_000) // minHoldAmount: 100 MIKO
      )
      .accounts({
        vault: vaultPda,
        tokenMint: new PublicKey(config.token.mint_address),
        payer: deployer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log('Vault initialized! Tx:', vaultTx);
  } catch (error) {
    console.error('Vault initialization error:', error);
  }
  
  // Initialize Smart Dial
  console.log('\nInitializing Smart Dial...');
  smartDialIdl.address = config.programs.smart_dial_program_id;
  const smartDialProgram = new Program(smartDialIdl, provider);
  
  try {
    const dialTx = await smartDialProgram.methods
      .initialize(
        deployer.publicKey                              // authority
      )
      .accounts({
        dialState: dialStatePda,
        payer: deployer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log('Smart Dial initialized! Tx:', dialTx);
  } catch (error) {
    console.error('Smart Dial initialization error:', error);
  }
  
  // Save initialization info
  const initInfo = {
    vault: {
      pda: vaultPda.toBase58(),
      bump: vaultBump,
      authority: deployer.publicKey.toBase58(),
      ownerWallet: deployer.publicKey.toBase58(),
      keeperAuthority: deployer.publicKey.toBase58(),
    },
    smartDial: {
      pda: dialStatePda.toBase58(),
      bump: dialBump,
      authority: deployer.publicKey.toBase58(),
    },
    timestamp: new Date().toISOString(),
  };
  
  fs.writeFileSync('phase4b-init-info.json', JSON.stringify(initInfo, null, 2));
  console.log('\nInitialization info saved to phase4b-init-info.json');
  
  console.log('\n===================================');
  console.log('Phase 4-B Initialization Complete!');
  console.log('===================================');
  console.log('\nNext steps:');
  console.log('1. Set launch time on Vault');
  console.log('2. Test launch sequence');
  console.log('3. Test fee transitions');
}

initializePrograms().catch(console.error);