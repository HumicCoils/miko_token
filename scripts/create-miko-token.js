const { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  createInitializeTransferHookInstruction,
  getMintLen,
  ExtensionType,
  getTransferFeeConfigAuthority,
  getTransferHookAuthority,
  createSetAuthorityInstruction,
  AuthorityType,
  getMint,
  getTransferFeeConfig,
  getTransferHook
} = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');
const bs58 = require('bs58').default;

// Load environment and configuration
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const RPC_URL = NETWORK === 'mainnet-beta' 
  ? 'https://api.mainnet-beta.solana.com'
  : 'https://api.devnet.solana.com';

// Load program IDs from shared artifacts
const programsPath = '/shared-artifacts/programs.json';
if (!fs.existsSync(programsPath)) {
  throw new Error('programs.json not found in shared-artifacts');
}

const programs = JSON.parse(fs.readFileSync(programsPath, 'utf8'));
const VAULT_PROGRAM_ID = new PublicKey(programs.absoluteVault.programId);
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(programs.transferHook.programId);

console.log('Loaded program IDs:');
console.log('- Absolute Vault:', VAULT_PROGRAM_ID.toString());
console.log('- Transfer Hook:', TRANSFER_HOOK_PROGRAM_ID.toString());

// Seeds for PDA derivation
const VAULT_SEED = Buffer.from('vault');

async function createMikoToken() {
  try {
    // Connect to cluster
    const connection = new Connection(RPC_URL, 'confirmed');
    console.log(`\nConnected to ${NETWORK}`);

    // Load payer keypair
    const payerKeypath = process.env.PAYER_KEYPAIR || '/root/.config/solana/id.json';
    if (!fs.existsSync(payerKeypath)) {
      throw new Error('Payer keypair not found. Please provide a funded keypair.');
    }
    const payer = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync(payerKeypath, 'utf8')))
    );
    console.log('Payer:', payer.publicKey.toString());

    // Check payer balance
    const balance = await connection.getBalance(payer.publicKey);
    console.log('Payer balance:', balance / LAMPORTS_PER_SOL, 'SOL');
    if (balance < 0.1 * LAMPORTS_PER_SOL) {
      throw new Error('Insufficient balance. Need at least 0.1 SOL');
    }

    // Generate new mint keypair
    const mint = Keypair.generate();
    console.log('\nGenerated mint address:', mint.publicKey.toString());
    console.log('Mint secret key (save this!):', bs58.encode(mint.secretKey));

    // Calculate Vault PDA (will be created later, but we need the address now)
    const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, mint.publicKey.toBuffer()],
      VAULT_PROGRAM_ID
    );
    console.log('\nVault PDA:', vaultPda.toString());
    console.log('Vault bump:', vaultBump);

    // Calculate mint size with extensions
    const extensions = [
      ExtensionType.TransferFeeConfig,
      ExtensionType.TransferHook
    ];
    const mintLen = getMintLen(extensions);
    console.log('\nMint account size with extensions:', mintLen);

    // Calculate minimum lamports for rent exemption
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
    console.log('Rent exemption lamports:', lamports);

    // Create mint account
    console.log('\nCreating mint account...');
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    // Initialize transfer fee config
    // 30% fee = 3000 basis points (out of 10000)
    const transferFeeConfigIx = createInitializeTransferFeeConfigInstruction(
      mint.publicKey,
      vaultPda, // transferFeeConfigAuthority (Vault PDA)
      vaultPda, // withdrawWithheldAuthority (Vault PDA)
      3000,     // transferFeeBasisPoints (30%)
      BigInt(10000), // maximumFee (100% as safety cap)
      TOKEN_2022_PROGRAM_ID
    );

    // Initialize transfer hook
    const transferHookIx = createInitializeTransferHookInstruction(
      mint.publicKey,
      vaultPda, // authority (Vault PDA)
      TRANSFER_HOOK_PROGRAM_ID, // hook program ID
      TOKEN_2022_PROGRAM_ID
    );

    // Initialize mint
    // Total supply: 1 billion tokens with 9 decimals
    const initializeMintIx = createInitializeMintInstruction(
      mint.publicKey,
      9, // decimals
      payer.publicKey, // temporary mint authority (will revoke)
      null, // freeze authority (null - no freezing)
      TOKEN_2022_PROGRAM_ID
    );

    // Create transaction with all initialization instructions
    const transaction = new Transaction();
    
    // Add compute budget for safety
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
    );

    transaction.add(
      createAccountIx,
      transferFeeConfigIx,
      transferHookIx,
      initializeMintIx
    );

    // Send and confirm transaction
    console.log('\nSending mint creation transaction...');
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer, mint],
      { commitment: 'confirmed' }
    );
    console.log('Transaction signature:', signature);

    // Verify mint was created correctly
    console.log('\nVerifying mint creation...');
    const mintInfo = await getMint(connection, mint.publicKey, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('Mint created successfully!');
    console.log('- Supply:', mintInfo.supply.toString());
    console.log('- Decimals:', mintInfo.decimals);
    console.log('- Mint Authority:', mintInfo.mintAuthority?.toString() || 'null');
    console.log('- Freeze Authority:', mintInfo.freezeAuthority?.toString() || 'null');

    // Verify transfer fee config
    const transferFeeConfig = await getTransferFeeConfig(mintInfo);
    if (transferFeeConfig) {
      console.log('\nTransfer Fee Config:');
      console.log('- Fee:', transferFeeConfig.newerTransferFee.transferFeeBasisPoints, 'basis points');
      console.log('- Max Fee:', transferFeeConfig.newerTransferFee.maximumFee.toString());
      console.log('- Config Authority:', transferFeeConfig.transferFeeConfigAuthority?.toString());
      console.log('- Withdraw Authority:', transferFeeConfig.withdrawWithheldAuthority?.toString());
    }

    // Verify transfer hook
    const transferHook = await getTransferHook(mintInfo);
    if (transferHook) {
      console.log('\nTransfer Hook:');
      console.log('- Program ID:', transferHook.programId?.toString());
      console.log('- Authority:', transferHook.authority?.toString());
    }

    // Revoke mint authority
    console.log('\nRevoking mint authority...');
    const revokeMintAuthorityIx = createSetAuthorityInstruction(
      mint.publicKey,
      payer.publicKey, // current authority
      AuthorityType.MintTokens,
      null, // new authority (null = revoked)
      [],
      TOKEN_2022_PROGRAM_ID
    );

    const revokeTransaction = new Transaction().add(revokeMintAuthorityIx);
    const revokeSignature = await sendAndConfirmTransaction(
      connection,
      revokeTransaction,
      [payer],
      { commitment: 'confirmed' }
    );
    console.log('Mint authority revoked! Signature:', revokeSignature);

    // Verify final state
    console.log('\nVerifying final mint state...');
    const finalMintInfo = await getMint(connection, mint.publicKey, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('Final mint state:');
    console.log('- Mint Authority:', finalMintInfo.mintAuthority?.toString() || 'null (revoked)');
    console.log('- Freeze Authority:', finalMintInfo.freezeAuthority?.toString() || 'null');

    // Save token info to shared artifacts
    const tokenInfo = {
      mint: mint.publicKey.toString(),
      decimals: 9,
      vaultPda: vaultPda.toString(),
      vaultBump: vaultBump,
      transferFeeConfig: {
        feeBasisPoints: 3000,
        maximumFee: '10000',
        configAuthority: vaultPda.toString(),
        withdrawAuthority: vaultPda.toString()
      },
      transferHook: {
        programId: TRANSFER_HOOK_PROGRAM_ID.toString(),
        authority: vaultPda.toString()
      },
      createdAt: new Date().toISOString(),
      network: NETWORK,
      mintSecretKey: bs58.encode(mint.secretKey) // IMPORTANT: Save this securely!
    };

    const tokenInfoPath = '/shared-artifacts/token-info.json';
    fs.writeFileSync(tokenInfoPath, JSON.stringify(tokenInfo, null, 2));
    console.log('\nToken info saved to:', tokenInfoPath);

    console.log('\n✅ MIKO Token created successfully!');
    console.log('==================================');
    console.log('Mint:', mint.publicKey.toString());
    console.log('Vault PDA:', vaultPda.toString());
    console.log('Initial Transfer Fee: 30% (3000 basis points)');
    console.log('Transfer Hook: Enabled');
    console.log('Mint Authority: Revoked');
    console.log('Freeze Authority: Never set (null)');
    console.log('\n⚠️  IMPORTANT: Save the mint secret key securely!');
    console.log('Secret Key:', bs58.encode(mint.secretKey));

  } catch (error) {
    console.error('\n❌ Error creating token:', error);
    if (error.logs) {
      console.error('\nTransaction logs:');
      error.logs.forEach(log => console.error(log));
    }
    process.exit(1);
  }
}

// Run the token creation
createMikoToken().catch(console.error);