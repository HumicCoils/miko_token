import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, setProvider, BN } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { readFileSync } from 'fs';
import * as path from 'path';

async function initializePrograms() {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  // Load keypairs
  const deployerKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(path.join(__dirname, 'phase4b-deployer.json'), 'utf-8')))
  );
  
  const ownerKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(path.join(__dirname, 'phase4b-owner-keypair.json'), 'utf-8')))
  );
  
  const treasuryKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(path.join(__dirname, 'phase4b-treasury-keypair.json'), 'utf-8')))
  );
  
  const keeperKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(path.join(__dirname, 'phase4b-keeper-keypair.json'), 'utf-8')))
  );
  
  // Load config
  const config = JSON.parse(readFileSync(path.join(__dirname, 'phase4b-config.json'), 'utf-8'));
  
  // Create wallet and provider
  const wallet = new NodeWallet(deployerKeypair);
  const provider = new AnchorProvider(
    connection,
    wallet,
    { commitment: 'confirmed' }
  );
  setProvider(provider);
  
  // Load IDLs
  const vaultIdl = JSON.parse(readFileSync(path.join(__dirname, 'phase4b-programs/target/idl/absolute_vault.json'), 'utf-8'));
  const smartDialIdl = JSON.parse(readFileSync(path.join(__dirname, 'phase4b-programs/target/idl/smart_dial.json'), 'utf-8'));
  
  // Override IDL addresses with deployed program IDs
  vaultIdl.address = config.programs.vault;
  smartDialIdl.address = config.programs.smartDial;
  
  // Create program instances
  const vaultProgram = new Program(vaultIdl, provider);
  const smartDialProgram = new Program(smartDialIdl, provider);
  
  try {
    // Initialize Vault
    console.log('Initializing Vault...');
    const minHoldAmount = new BN(100_000_000_000); // 100 MIKO with 9 decimals
    
    const vaultTx = await vaultProgram.methods
      .initialize(
        deployerKeypair.publicKey,    // authority (deployer)
        ownerKeypair.publicKey,       // owner_wallet
        keeperKeypair.publicKey,      // keeper_authority
        minHoldAmount
      )
      .accounts({
        tokenMint: new PublicKey(config.mikoToken),
        payer: deployerKeypair.publicKey,
      })
      .rpc();
    
    console.log('Vault initialized:', vaultTx);
    console.log('- Authority:', deployerKeypair.publicKey.toString());
    console.log('- Owner:', ownerKeypair.publicKey.toString());
    console.log('- Keeper:', keeperKeypair.publicKey.toString());
    
    // Initialize Smart Dial
    console.log('\nInitializing Smart Dial...');
    const smartDialTx = await smartDialProgram.methods
      .initialize(
        deployerKeypair.publicKey,    // authority (deployer)
        treasuryKeypair.publicKey     // treasury
      )
      .rpc();
    
    console.log('Smart Dial initialized:', smartDialTx);
    console.log('- Authority:', deployerKeypair.publicKey.toString());
    console.log('- Treasury:', treasuryKeypair.publicKey.toString());
    
    console.log('\nPrograms initialized successfully with proper wallet separation!');
    
  } catch (error) {
    console.error('Error initializing programs:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  initializePrograms()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { initializePrograms };