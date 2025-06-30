const { 
  Connection, 
  Keypair, 
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet, BN } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load test environment
dotenv.config({ path: '.env.test' });

async function initializePrograms() {
  console.log('Initializing programs on devnet...');
  
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
  
  // Load keeper wallet
  const keeperKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('./keeper-bot-wallet.json', 'utf-8')))
  );
  
  console.log('Keeper wallet:', keeperKeypair.publicKey.toBase58());
  
  // Load treasury and owner wallets
  const treasuryKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('./treasury-wallet.json', 'utf-8')))
  );
  const ownerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('./owner-wallet.json', 'utf-8')))
  );
  
  console.log('Treasury wallet:', treasuryKeypair.publicKey.toBase58());
  console.log('Owner wallet:', ownerKeypair.publicKey.toBase58());
  
  // Setup provider
  const provider = new AnchorProvider(
    connection,
    new Wallet(keeperKeypair),
    { commitment: 'confirmed' }
  );
  
  // Import IDLs
  const absoluteVaultIdl = JSON.parse(
    fs.readFileSync('./target/idl/absolute_vault.json', 'utf-8')
  );
  const smartDialIdl = JSON.parse(
    fs.readFileSync('./target/idl/smart_dial.json', 'utf-8')
  );
  
  // Load programs
  const ABSOLUTE_VAULT_PROGRAM = new PublicKey(process.env.ABSOLUTE_VAULT_PROGRAM!);
  const SMART_DIAL_PROGRAM = new PublicKey(process.env.SMART_DIAL_PROGRAM!);
  
  const absoluteVault = new Program(
    absoluteVaultIdl,
    ABSOLUTE_VAULT_PROGRAM,
    provider
  );
  
  const smartDial = new Program(
    smartDialIdl,
    SMART_DIAL_PROGRAM,
    provider
  );
  
  try {
    // First check balances
    const keeperBalance = await connection.getBalance(keeperKeypair.publicKey);
    console.log(`\nKeeper balance: ${keeperBalance / 1e9} SOL`);
    
    if (keeperBalance < 0.1 * 1e9) {
      console.log('Keeper wallet balance too low, requesting airdrop...');
      await connection.requestAirdrop(keeperKeypair.publicKey, 2 * 1e9);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Initialize Smart Dial first
    console.log('\nInitializing Smart Dial...');
    
    const [smartDialConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      SMART_DIAL_PROGRAM
    );

    try {
      // Check if already initialized
      await smartDial.account.config.fetch(smartDialConfig);
      console.log('Smart Dial already initialized');
    } catch {
      const initDialTx = await smartDial.methods
        .initialize(keeperKeypair.publicKey)
        .accounts({
          config: smartDialConfig,
          keeper: keeperKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log('Smart Dial initialized:', initDialTx);
    }
    
    // Initialize Absolute Vault
    console.log('\nInitializing Absolute Vault...');
    
    const [taxConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("tax_config")],
      ABSOLUTE_VAULT_PROGRAM
    );

    try {
      // Check if already initialized
      await absoluteVault.account.taxConfig.fetch(taxConfig);
      console.log('Absolute Vault already initialized');
    } catch {
      const initVaultTx = await absoluteVault.methods
        .initialize(
          ownerKeypair.publicKey,
          treasuryKeypair.publicKey,
          keeperKeypair.publicKey
        )
        .accounts({
          taxConfig,
          authority: keeperKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log('Absolute Vault initialized:', initVaultTx);
    }

    // Initialize holder registry
    console.log('\nInitializing holder registry...');
    
    const [holderRegistry] = PublicKey.findProgramAddressSync(
      [Buffer.from("holder_registry"), new BN(0).toArrayLike(Buffer, 'le', 8)],
      ABSOLUTE_VAULT_PROGRAM
    );

    try {
      // Check if already initialized
      await absoluteVault.account.holderRegistry.fetch(holderRegistry);
      console.log('Holder registry already initialized');
    } catch {
      const initRegistryTx = await absoluteVault.methods
        .initializeRegistry()
        .accounts({
          taxConfig,
          holderRegistry,
          authority: keeperKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log('Holder registry initialized:', initRegistryTx);
    }
    
    console.log('\nAll programs initialized successfully!');
    console.log('\nNext steps:');
    console.log('1. Create MIKO token with transfer fees');
    console.log('2. Initialize vault token account');
    console.log('3. Run test transactions');
    
  } catch (error) {
    console.error('Initialization failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    process.exit(1);
  }
}

initializePrograms().catch(console.error);