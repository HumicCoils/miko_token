const { 
  Connection, 
  Keypair, 
  PublicKey,
  SystemProgram,
} = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet, BN } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load test environment
dotenv.config({ path: '../.env.test' });

async function initializePrograms() {
  console.log('Initializing programs on devnet...');
  
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
  
  // Load keeper wallet
  const keeperKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../keeper-bot-wallet.json', 'utf-8')))
  );
  
  console.log('Keeper wallet:', keeperKeypair.publicKey.toBase58());
  
  // Load treasury and owner wallets
  const treasuryKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../treasury-wallet.json', 'utf-8')))
  );
  const ownerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../owner-wallet.json', 'utf-8')))
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
    fs.readFileSync('../target/idl/absolute_vault.json', 'utf-8')
  );
  const smartDialIdl = JSON.parse(
    fs.readFileSync('../target/idl/smart_dial.json', 'utf-8')
  );
  
  // Load programs
  const ABSOLUTE_VAULT_PROGRAM = new PublicKey(process.env.ABSOLUTE_VAULT_PROGRAM);
  const SMART_DIAL_PROGRAM = new PublicKey(process.env.SMART_DIAL_PROGRAM);
  
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
      try {
        await connection.requestAirdrop(keeperKeypair.publicKey, 2 * 1e9);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (e) {
        console.log('Airdrop failed, continuing anyway...');
      }
    }

    // Initialize Smart Dial first
    console.log('\nInitializing Smart Dial...');
    
    const [smartDialConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("smart_dial_config")],
      SMART_DIAL_PROGRAM
    );

    try {
      // Check if already initialized
      await smartDial.account.dialConfig.fetch(smartDialConfig);
      console.log('Smart Dial already initialized');
    } catch {
      const initDialTx = await smartDial.methods
        .initialize(keeperKeypair.publicKey, treasuryKeypair.publicKey)
        .accounts({
          authority: keeperKeypair.publicKey,
          dialConfig: smartDialConfig,
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
      // First we need a MIKO token mint for initialization
      const mikoTokenMint = new PublicKey("11111111111111111111111111111111"); // Placeholder for now
      
      const [exclusionList] = PublicKey.findProgramAddressSync(
        [Buffer.from("exclusions")],
        ABSOLUTE_VAULT_PROGRAM
      );
      
      const [feeAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("fee_authority")],
        ABSOLUTE_VAULT_PROGRAM
      );
      
      const [withdrawAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("withdraw_authority")],
        ABSOLUTE_VAULT_PROGRAM
      );
      
      const initVaultTx = await absoluteVault.methods
        .initialize(
          SMART_DIAL_PROGRAM,
          keeperKeypair.publicKey,
          ownerKeypair.publicKey
        )
        .accounts({
          authority: keeperKeypair.publicKey,
          taxConfig,
          exclusionList,
          feeAuthority,
          withdrawAuthority,
          treasuryWallet: treasuryKeypair.publicKey,
          mikoTokenMint,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log('Absolute Vault initialized:', initVaultTx);
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