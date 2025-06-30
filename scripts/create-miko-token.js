const { 
  Connection, 
  Keypair, 
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} = require('@solana/web3.js');
const { 
  TOKEN_2022_PROGRAM_ID,
  createInitializeTransferFeeConfigInstruction,
  createInitializeMintInstruction,
  getMintLen,
  ExtensionType,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createAccount,
  mintTo,
} = require('@solana/spl-token');
const fs = require('fs');
const dotenv = require('dotenv');
const BN = require('bn.js');

// Load test environment
dotenv.config({ path: '../.env.test' });

async function createMikoToken() {
  console.log('Creating MIKO test token with 5% transfer fees...');
  
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
  
  // Load keeper wallet as payer
  const payerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../keeper-bot-wallet.json', 'utf-8')))
  );
  
  console.log('Payer wallet:', payerKeypair.publicKey.toBase58());
  
  // Generate new mint keypair
  const mintKeypair = Keypair.generate();
  console.log('New MIKO token mint:', mintKeypair.publicKey.toBase58());
  
  // Get mint account size with transfer fee extension
  const extensions = [ExtensionType.TransferFeeConfig];
  const mintLen = getMintLen(extensions);
  
  // Calculate rent
  const mintRent = await connection.getMinimumBalanceForRentExemption(mintLen);
  
  // Load fee authorities from Absolute Vault program
  const ABSOLUTE_VAULT_PROGRAM = new PublicKey(process.env.ABSOLUTE_VAULT_PROGRAM);
  
  const [withdrawAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("withdraw_authority")],
    ABSOLUTE_VAULT_PROGRAM
  );
  
  const [feeAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_authority")],
    ABSOLUTE_VAULT_PROGRAM
  );
  
  console.log('Withdraw authority:', withdrawAuthority.toBase58());
  console.log('Fee authority:', feeAuthority.toBase58());
  
  try {
    // Create mint account with transfer fee config
    const transaction = new Transaction();
    
    // 1. Create mint account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payerKeypair.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintLen,
        lamports: mintRent,
        programId: TOKEN_2022_PROGRAM_ID,
      })
    );
    
    // 2. Initialize transfer fee config (5% = 500 basis points)
    const FEE_BASIS_POINTS = 500; // 5%
    const MAX_FEE = BigInt("18446744073709551615"); // u64::MAX
    
    transaction.add(
      createInitializeTransferFeeConfigInstruction(
        mintKeypair.publicKey,
        withdrawAuthority,
        feeAuthority,
        FEE_BASIS_POINTS,
        MAX_FEE,
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    // 3. Initialize mint
    const DECIMALS = 9;
    transaction.add(
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        DECIMALS,
        payerKeypair.publicKey, // Mint authority
        null, // Freeze authority
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    // Send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payerKeypair, mintKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log('MIKO token created successfully!');
    console.log('Transaction signature:', signature);
    console.log('Token mint address:', mintKeypair.publicKey.toBase58());
    
    // Save mint address to env file
    const envContent = fs.readFileSync('../.env.test', 'utf-8');
    const updatedEnv = envContent + `\nMIKO_TOKEN_MINT=${mintKeypair.publicKey.toBase58()}`;
    fs.writeFileSync('../.env.test', updatedEnv);
    
    console.log('\n.env.test updated with MIKO_TOKEN_MINT');
    
    // Create test token accounts and mint some tokens
    console.log('\nCreating test token accounts...');
    
    // Load test wallets
    const treasuryKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync('../treasury-wallet.json', 'utf-8')))
    );
    const ownerKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync('../owner-wallet.json', 'utf-8')))
    );
    
    // Create associated token accounts
    const treasuryAta = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      treasuryKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    const ownerAta = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      ownerKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    const tx2 = new Transaction();
    
    // Create ATAs
    tx2.add(
      createAssociatedTokenAccountInstruction(
        payerKeypair.publicKey,
        treasuryAta,
        treasuryKeypair.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    tx2.add(
      createAssociatedTokenAccountInstruction(
        payerKeypair.publicKey,
        ownerAta,
        ownerKeypair.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    // Mint 1 million MIKO to treasury for testing
    const MINT_AMOUNT = new BN(1_000_000).mul(new BN(10).pow(new BN(DECIMALS)));
    tx2.add(
      createMintToInstruction(
        mintKeypair.publicKey,
        treasuryAta,
        payerKeypair.publicKey,
        MINT_AMOUNT.toNumber(), // spl-token 0.3.9 expects number
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    const sig2 = await sendAndConfirmTransaction(
      connection,
      tx2,
      [payerKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log('Test accounts created and funded:', sig2);
    console.log('\nNext steps:');
    console.log('1. Initialize Absolute Vault with MIKO token mint');
    console.log('2. Create test holder wallets');
    console.log('3. Run test transactions to generate fees');
    
  } catch (error) {
    console.error('Failed to create MIKO token:', error);
    process.exit(1);
  }
}

createMikoToken().catch(console.error);