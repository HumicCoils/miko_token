import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { NATIVE_MINT } from '@solana/spl-token';
import * as fs from 'fs';

const FORK_URL = 'http://127.0.0.1:8899';

// Import Phase 4-B IDLs
const vaultIdl = JSON.parse(fs.readFileSync('phase4b-vault-idl.json', 'utf-8'));
const smartDialIdl = JSON.parse(fs.readFileSync('phase4b-smart-dial-idl.json', 'utf-8'));

// Load Phase 4-B config
const config = JSON.parse(fs.readFileSync('phase4b-config.json', 'utf-8'));

async function initializePrograms() {
  const connection = new Connection(FORK_URL, 'confirmed');
  
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
  console.log('MIKO Token:', config.mikoToken);
  console.log('Vault Program:', config.programs.vault);
  console.log('Smart Dial Program:', config.programs.smartDial);
  
  // Calculate PDAs
  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), new PublicKey(config.mikoToken).toBuffer()],
    new PublicKey(config.programs.vault)
  );
  
  const [dialStatePda, dialBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('smart-dial')],
    new PublicKey(config.programs.smartDial)
  );
  
  console.log('\nPDAs calculated:');
  console.log('Vault PDA:', vaultPda.toBase58(), 'bump:', vaultBump);
  console.log('Dial State PDA:', dialStatePda.toBase58(), 'bump:', dialBump);
  
  // Initialize Vault
  console.log('\nInitializing Vault...');
  const vaultProgram = new Program(vaultIdl, provider);
  
  try {
    const vaultTx = await vaultProgram.methods
      .initialize(
        deployer.publicKey,     // authority (will be updated later)
        deployer.publicKey,     // treasury (will be updated later)
        deployer.publicKey,     // ownerWallet (will be updated later)
        deployer.publicKey,     // keeperAuthority (will be updated later)
        new BN(100_000_000_000) // minHoldAmount: 100 MIKO
      )
      .accounts({
        vault: vaultPda,
        tokenMint: new PublicKey(config.mikoToken),
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
  const smartDialProgram = new Program(smartDialIdl, provider);
  
  try {
    const dialTx = await smartDialProgram.methods
      .initialize(
        deployer.publicKey,                             // authority
        deployer.publicKey                              // treasury (will be updated later)
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
      treasury: deployer.publicKey.toBase58(),
      ownerWallet: deployer.publicKey.toBase58(),
      keeperAuthority: deployer.publicKey.toBase58(),
    },
    smartDial: {
      pda: dialStatePda.toBase58(),
      bump: dialBump,
      authority: deployer.publicKey.toBase58(),
      treasury: deployer.publicKey.toBase58(),
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