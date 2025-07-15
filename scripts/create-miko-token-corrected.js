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
  getMint,
  getTransferFeeConfig,
  getTransferHook,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createMintToInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID
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

// Seeds for PDA derivation (for reference - PDA will be created in Phase 3)
const VAULT_SEED = Buffer.from('vault');

// Total supply: 1 billion tokens with 9 decimals
const TOTAL_SUPPLY = BigInt(1_000_000_000) * BigInt(10 ** 9);

async function createMikoToken() {
  try {
    // Connect to cluster
    const connection = new Connection(RPC_URL, 'confirmed');
    console.log(`\nConnected to ${NETWORK}`);

    // Load payer keypair (deployer)
    const payerKeypath = process.env.PAYER_KEYPAIR || '/root/.config/solana/id.json';
    if (!fs.existsSync(payerKeypath)) {
      throw new Error('Payer keypair not found. Please provide a funded keypair.');
    }
    const deployer = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync(payerKeypath, 'utf8')))
    );
    console.log('Deployer:', deployer.publicKey.toString());

    // Check deployer balance
    const balance = await connection.getBalance(deployer.publicKey);
    console.log('Deployer balance:', balance / LAMPORTS_PER_SOL, 'SOL');
    if (balance < 0.1 * LAMPORTS_PER_SOL) {
      throw new Error('Insufficient balance. Need at least 0.1 SOL');
    }

    // Generate new mint keypair
    const mint = Keypair.generate();
    console.log('\nGenerated mint address:', mint.publicKey.toString());
    console.log('Mint secret key (save this!):', bs58.encode(mint.secretKey));

    // Calculate future Vault PDA (for reference - it doesn't exist yet!)
    const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, mint.publicKey.toBuffer()],
      VAULT_PROGRAM_ID
    );
    console.log('\nFuture Vault PDA (will be created in Phase 3):', vaultPda.toString());
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
    console.log('\n=== Creating Token with Temporary Authorities ===');
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: deployer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    // Initialize transfer fee config with DEPLOYER as temporary authority
    console.log('Setting deployer as temporary fee authorities...');
    const transferFeeConfigIx = createInitializeTransferFeeConfigInstruction(
      mint.publicKey,
      deployer.publicKey, // transferFeeConfigAuthority (TEMPORARY)
      deployer.publicKey, // withdrawWithheldAuthority (TEMPORARY)
      3000,     // transferFeeBasisPoints (30%)
      BigInt(10000), // maximumFee (100% as safety cap)
      TOKEN_2022_PROGRAM_ID
    );

    // Initialize transfer hook with DEPLOYER as temporary authority
    console.log('Setting deployer as temporary hook authority...');
    const transferHookIx = createInitializeTransferHookInstruction(
      mint.publicKey,
      deployer.publicKey, // authority (TEMPORARY)
      TRANSFER_HOOK_PROGRAM_ID, // hook program ID
      TOKEN_2022_PROGRAM_ID
    );

    // Initialize mint with deployer as mint authority (TEMPORARY)
    const initializeMintIx = createInitializeMintInstruction(
      mint.publicKey,
      9, // decimals
      deployer.publicKey, // mint authority (TEMPORARY - needed to mint supply)
      null, // freeze authority (null - no freezing ever)
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
      [deployer, mint],
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

    // Create associated token account for deployer to hold initial supply
    console.log('\n=== Minting Total Supply ===');
    console.log('Creating token account for deployer...');
    const deployerTokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      deployer.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const createATAIx = createAssociatedTokenAccountInstruction(
      deployer.publicKey,
      deployerTokenAccount,
      deployer.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Mint the total supply
    console.log('Minting 1,000,000,000 MIKO tokens...');
    const mintToIx = createMintToInstruction(
      mint.publicKey,
      deployerTokenAccount,
      deployer.publicKey, // mint authority
      TOTAL_SUPPLY,
      [],
      TOKEN_2022_PROGRAM_ID
    );

    const mintTransaction = new Transaction().add(createATAIx, mintToIx);
    const mintSignature = await sendAndConfirmTransaction(
      connection,
      mintTransaction,
      [deployer],
      { commitment: 'confirmed' }
    );
    console.log('Minted! Signature:', mintSignature);

    // Verify final state
    console.log('\n=== Verifying Token State ===');
    const finalMintInfo = await getMint(connection, mint.publicKey, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('Token state after minting:');
    console.log('- Total Supply:', finalMintInfo.supply.toString(), '(raw units)');
    console.log('- Total Supply:', Number(finalMintInfo.supply) / (10 ** 9), 'MIKO');
    console.log('- Mint Authority:', finalMintInfo.mintAuthority?.toString(), '(still deployer - will be revoked in Phase 3)');
    console.log('- Freeze Authority:', finalMintInfo.freezeAuthority?.toString() || 'null (permanent)');

    // Verify transfer fee config
    const transferFeeConfig = await getTransferFeeConfig(finalMintInfo);
    if (transferFeeConfig) {
      console.log('\nTransfer Fee Config:');
      console.log('- Fee:', transferFeeConfig.newerTransferFee.transferFeeBasisPoints, 'basis points (30%)');
      console.log('- Max Fee:', transferFeeConfig.newerTransferFee.maximumFee.toString());
      console.log('- Config Authority:', transferFeeConfig.transferFeeConfigAuthority?.toString(), '(temporary)');
      console.log('- Withdraw Authority:', transferFeeConfig.withdrawWithheldAuthority?.toString(), '(temporary)');
    }

    // Verify transfer hook
    const transferHook = await getTransferHook(finalMintInfo);
    if (transferHook) {
      console.log('\nTransfer Hook:');
      console.log('- Program ID:', transferHook.programId?.toString());
      console.log('- Authority:', transferHook.authority?.toString(), '(temporary)');
    }

    // Save token info to shared artifacts
    const tokenInfo = {
      mint: mint.publicKey.toString(),
      decimals: 9,
      totalSupply: "1000000000",
      totalSupplyRaw: TOTAL_SUPPLY.toString(),
      temporaryAuthority: deployer.publicKey.toString(),
      deployerTokenAccount: deployerTokenAccount.toString(),
      futureVaultPda: vaultPda.toString(),
      vaultBump: vaultBump,
      transferFeeConfig: {
        feeBasisPoints: 3000,
        maximumFee: '10000',
        temporaryConfigAuthority: deployer.publicKey.toString(),
        temporaryWithdrawAuthority: deployer.publicKey.toString()
      },
      transferHook: {
        programId: TRANSFER_HOOK_PROGRAM_ID.toString(),
        temporaryAuthority: deployer.publicKey.toString()
      },
      createdAt: new Date().toISOString(),
      network: NETWORK,
      mintSecretKey: bs58.encode(mint.secretKey), // IMPORTANT: Save this securely!
      phase: "Phase 2 Complete - Awaiting Phase 3 for authority transfers"
    };

    const tokenInfoPath = '/shared-artifacts/token-info.json';
    fs.writeFileSync(tokenInfoPath, JSON.stringify(tokenInfo, null, 2));
    console.log('\nToken info saved to:', tokenInfoPath);

    console.log('\n✅ MIKO Token created successfully with temporary authorities!');
    console.log('=======================================================');
    console.log('Mint:', mint.publicKey.toString());
    console.log('Total Supply:', '1,000,000,000 MIKO');
    console.log('Current Holder:', deployer.publicKey.toString());
    console.log('Token Account:', deployerTokenAccount.toString());
    console.log('\nCurrent Authorities (TEMPORARY):');
    console.log('- Mint Authority:', deployer.publicKey.toString());
    console.log('- Fee Config Authority:', deployer.publicKey.toString());
    console.log('- Withdraw Authority:', deployer.publicKey.toString());
    console.log('- Hook Authority:', deployer.publicKey.toString());
    console.log('\nPermanent Settings:');
    console.log('- Freeze Authority: null (tokens can never be frozen)');
    console.log('- Transfer Fee: 30% (3000 basis points)');
    console.log('- Transfer Hook: Enabled');
    console.log('\n⚠️  IMPORTANT: All authorities will be transferred to Vault PDA in Phase 3!');
    console.log('⚠️  IMPORTANT: Save the mint secret key securely!');
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