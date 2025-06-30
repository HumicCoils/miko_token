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
const dotenv = require('dotenv');

// Load test environment
dotenv.config({ path: '../.env.test' });

async function initializeAbsoluteVault() {
  console.log('Initializing Absolute Vault with MIKO token...');
  
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
  
  // Load wallets
  const keeperKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../keeper-bot-wallet.json', 'utf-8')))
  );
  
  const treasuryKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../treasury-wallet.json', 'utf-8')))
  );
  
  const ownerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../owner-wallet.json', 'utf-8')))
  );
  
  console.log('Keeper wallet:', keeperKeypair.publicKey.toBase58());
  console.log('Treasury wallet:', treasuryKeypair.publicKey.toBase58());
  console.log('Owner wallet:', ownerKeypair.publicKey.toBase58());
  
  // Setup provider
  const provider = new AnchorProvider(
    connection,
    new Wallet(keeperKeypair),
    { commitment: 'confirmed' }
  );
  
  // Import IDL
  const absoluteVaultIdl = JSON.parse(
    fs.readFileSync('../target/idl/absolute_vault.json', 'utf-8')
  );
  
  // Load programs
  const ABSOLUTE_VAULT_PROGRAM = new PublicKey(process.env.ABSOLUTE_VAULT_PROGRAM);
  const SMART_DIAL_PROGRAM = new PublicKey(process.env.SMART_DIAL_PROGRAM);
  const MIKO_TOKEN_MINT = new PublicKey(process.env.MIKO_TOKEN_MINT);
  
  console.log('\nProgram IDs:');
  console.log('Absolute Vault:', ABSOLUTE_VAULT_PROGRAM.toBase58());
  console.log('Smart Dial:', SMART_DIAL_PROGRAM.toBase58());
  console.log('MIKO Token:', MIKO_TOKEN_MINT.toBase58());
  
  const absoluteVault = new Program(
    absoluteVaultIdl,
    ABSOLUTE_VAULT_PROGRAM,
    provider
  );
  
  try {
    // Initialize Absolute Vault
    console.log('\nInitializing Absolute Vault...');
    
    const [taxConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("tax_config")],
      ABSOLUTE_VAULT_PROGRAM
    );
    
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
    
    try {
      // Check if already initialized
      await absoluteVault.account.taxConfig.fetch(taxConfig);
      console.log('Absolute Vault already initialized');
    } catch {
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
          mikoTokenMint: MIKO_TOKEN_MINT,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log('Absolute Vault initialized:', initVaultTx);
    }
    
    // Initialize holder registry
    console.log('\nInitializing holder registry...');
    
    const [holderRegistry] = PublicKey.findProgramAddressSync(
      [Buffer.from("holder_registry")],
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
          keeperBot: keeperKeypair.publicKey,
          taxConfig,
          holderRegistry,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log('Holder registry initialized:', initRegistryTx);
    }
    
    // Initialize vault token account
    console.log('\nInitializing vault token account...');
    
    const [vaultAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), MIKO_TOKEN_MINT.toBytes()],
      ABSOLUTE_VAULT_PROGRAM
    );
    
    try {
      const initVaultAccountTx = await absoluteVault.methods
        .initializeVault()
        .accounts({
          authority: keeperKeypair.publicKey,
          taxConfig,
          mikoTokenMint: MIKO_TOKEN_MINT,
          vaultAccount,
          systemProgram: SystemProgram.programId,
          token2022Program: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
        })
        .rpc();
      
      console.log('Vault token account initialized:', initVaultAccountTx);
    } catch (error) {
      console.log('Vault token account initialization failed:', error.message);
    }
    
    console.log('\nAbsolute Vault setup complete!');
    console.log('\nNext steps:');
    console.log('1. Update holder registry with current token holders');
    console.log('2. Start keeper bot to harvest fees');
    console.log('3. Monitor fee collection and distribution');
    
  } catch (error) {
    console.error('Initialization failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
  }
}

initializeAbsoluteVault().catch(console.error);