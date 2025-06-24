import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

async function initializeTestPrograms() {
  console.log('[TEST MODE] Initializing programs for devnet testing...');
  
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
  
  // Load keeper wallet
  const keeperKeypair = Keypair.fromSecretKey(
    Buffer.from(process.env.KEEPER_BOT_PRIVATE_KEY!, 'base64')
  );
  
  console.log('Keeper wallet:', keeperKeypair.publicKey.toBase58());
  
  // Load treasury and owner wallets
  let treasuryWallet: PublicKey;
  let ownerWallet: PublicKey;
  
  if (process.env.TREASURY_WALLET) {
    treasuryWallet = new PublicKey(process.env.TREASURY_WALLET);
  } else {
    console.log('Generating new treasury wallet...');
    const treasuryKeypair = Keypair.generate();
    treasuryWallet = treasuryKeypair.publicKey;
    fs.writeFileSync('./treasury-wallet.json', JSON.stringify(Array.from(treasuryKeypair.secretKey)));
  }
  
  if (process.env.OWNER_WALLET) {
    ownerWallet = new PublicKey(process.env.OWNER_WALLET);
  } else {
    console.log('Generating new owner wallet...');
    const ownerKeypair = Keypair.generate();
    ownerWallet = ownerKeypair.publicKey;
    fs.writeFileSync('./owner-wallet.json', JSON.stringify(Array.from(ownerKeypair.secretKey)));
  }
  
  console.log('Treasury wallet:', treasuryWallet.toBase58());
  console.log('Owner wallet:', ownerWallet.toBase58());
  
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
    // Initialize Absolute Vault
    console.log('\n[TEST MODE] Initializing Absolute Vault...');
    
    const initVaultTx = await absoluteVault.methods
      .initialize(
        ownerWallet,
        treasuryWallet,
        keeperKeypair.publicKey
      )
      .accounts({
        payer: keeperKeypair.publicKey,
      })
      .rpc();
    
    console.log('Absolute Vault initialized:', initVaultTx);
    
    // Initialize Smart Dial
    console.log('\n[TEST MODE] Initializing Smart Dial...');
    
    const initDialTx = await smartDial.methods
      .initialize(keeperKeypair.publicKey)
      .accounts({
        payer: keeperKeypair.publicKey,
      })
      .rpc();
    
    console.log('Smart Dial initialized:', initDialTx);
    
    // Initialize exclusion list
    console.log('\n[TEST MODE] Initializing exclusion lists...');
    
    const exclusions = [
      treasuryWallet,
      ownerWallet,
      keeperKeypair.publicKey,
    ];
    
    const exclusionTx = await absoluteVault.methods
      .initializeExclusions(exclusions, exclusions)
      .accounts({
        payer: keeperKeypair.publicKey,
      })
      .rpc();
    
    console.log('Exclusions initialized:', exclusionTx);
    
    console.log('\n[TEST MODE] All programs initialized successfully!');
    console.log('\nNext steps:');
    console.log('1. Run: npm run create-token');
    console.log('2. Update .env.test with MIKO_TOKEN_MINT');
    console.log('3. Run: npm run test:all');
    
  } catch (error) {
    console.error('[TEST MODE] Initialization failed:', error);
    process.exit(1);
  }
}

initializeTestPrograms().catch(console.error);