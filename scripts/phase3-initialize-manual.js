const { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const {
  TOKEN_2022_PROGRAM_ID,
  setAuthority,
  AuthorityType,
  getMint,
  getTransferFeeConfig,
  getTransferHook,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID
} = require('@solana/spl-token');
const borsh = require('borsh');
const { Buffer } = require('buffer');
const BN = require('bn.js');
const crypto = require('crypto');
const fs = require('fs');

// Load environment and configuration
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const RPC_URL = NETWORK === 'mainnet-beta' 
  ? 'https://api.mainnet-beta.solana.com'
  : 'https://api.devnet.solana.com';

// Load program IDs from shared artifacts
const programsPath = '/shared-artifacts/programs.json';
const tokenInfoPath = '/shared-artifacts/token-info.json';

if (!fs.existsSync(programsPath)) {
  throw new Error('programs.json not found in shared-artifacts');
}
if (!fs.existsSync(tokenInfoPath)) {
  throw new Error('token-info.json not found in shared-artifacts');
}

const programs = JSON.parse(fs.readFileSync(programsPath, 'utf8'));
const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf8'));

// Extract program IDs - use the deployed IDs, not the declared IDs
const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey(programs.absoluteVault.programId);
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(programs.transferHook.programId); // B2KkZbyd9jptD4ns1mBCCrLXH9ozbTWGN4PwgKfAg3LP
const SMART_DIAL_PROGRAM_ID = new PublicKey(programs.smartDial.programId);

// Extract token info
const MINT_ADDRESS = new PublicKey(tokenInfo.mint);
const VAULT_PDA = new PublicKey(tokenInfo.futureVaultPda);
const VAULT_BUMP = tokenInfo.vaultBump;

// Initialize connection
const connection = new Connection(RPC_URL, 'confirmed');

// Load deployer keypair (temporary authority)
const deployerKeypath = process.env.PAYER_KEYPAIR || '/root/.config/solana/id.json';
const deployer = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(deployerKeypath, 'utf8')))
);

// Configuration wallets (using deployer for demo, should be different in production)
const TREASURY_WALLET = deployer.publicKey;
const OWNER_WALLET = deployer.publicKey;
const KEEPER_WALLET = deployer.publicKey;

// Constants
const HARVEST_THRESHOLD = BigInt(500000 * 10 ** 9); // 500k MIKO with 9 decimals
const MIN_HOLD_AMOUNT = BigInt(100 * 10 ** 9); // $100 worth - placeholder value

// Calculate instruction discriminator (Anchor standard)
function calculateDiscriminator(namespace, name) {
  const preimage = `${namespace}:${name}`;
  const hash = crypto.createHash('sha256').update(preimage, 'utf8').digest();
  return hash.subarray(0, 8);
}

// Note: We'll use newer borsh syntax for serialization in each function

async function initializeSystem() {
  console.log('🚀 Phase 3: System Initialization (Manual Instruction Construction)');
  console.log('=================================================================\n');
  
  console.log('📋 Configuration:');
  console.log('- Network:', NETWORK);
  console.log('- Deployer:', deployer.publicKey.toString());
  console.log('- Mint:', MINT_ADDRESS.toString());
  console.log('- Vault PDA:', VAULT_PDA.toString());
  console.log('- Vault Bump:', VAULT_BUMP);
  console.log('\n');

  try {
    // Verify PDA derivation
    const [derivedVaultPda, derivedBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), MINT_ADDRESS.toBuffer()],
      ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    if (!derivedVaultPda.equals(VAULT_PDA)) {
      throw new Error('Vault PDA mismatch!');
    }
    console.log('✅ Vault PDA verified\n');

    // 1. Initialize Vault
    console.log('1️⃣ Initializing Vault Program...');
    await initializeVault();
    
    // 2. Initialize Transfer Hook
    console.log('\n2️⃣ Initializing Transfer Hook...');
    await initializeTransferHook();
    await initializeTransferHookExtraAccountMetas();
    
    // 3. Transfer Authorities
    console.log('\n3️⃣ Transferring Authorities to Vault PDA...');
    await transferAuthorities();
    
    // 4. Test Transfer Fee
    console.log('\n4️⃣ Testing 30% Transfer Fee...');
    await testTransferFee();
    
    // 5. Revoke Mint Authority
    console.log('\n5️⃣ Revoking Mint Authority...');
    await revokeMintAuthority();
    
    // 6. Initialize Smart Dial
    console.log('\n6️⃣ Initializing Smart Dial...');
    await initializeSmartDial();
    
    console.log('\n✅ Phase 3 Complete! System initialized and authorities transferred.');
    
  } catch (error) {
    console.error('\n❌ Error during initialization:', error);
    process.exit(1);
  }
}

async function initializeVault() {
  try {
    // Check if vault already exists
    try {
      const vaultInfo = await connection.getAccountInfo(VAULT_PDA);
      if (vaultInfo && vaultInfo.owner.equals(ABSOLUTE_VAULT_PROGRAM_ID)) {
        console.log('✅ Vault already initialized, skipping...');
        return;
      }
    } catch (e) {
      // Account doesn't exist, proceed with initialization
    }
    
    // Calculate discriminator for 'initialize' instruction
    const discriminator = calculateDiscriminator('global', 'initialize');
    
    // Define class for borsh serialization
    class InitializeVaultData {
      constructor(fields) {
        this.minHoldAmount = fields.minHoldAmount;
      }
    }
    
    // Create Map-based schema for borsh v0.7.0
    const schema = new Map([
      [InitializeVaultData, {
        kind: 'struct',
        fields: [
          ['minHoldAmount', 'u64']
        ]
      }]
    ]);
    
    // Create data instance
    const dataObj = new InitializeVaultData({
      minHoldAmount: MIN_HOLD_AMOUNT
    });
    
    // Serialize using Map-based schema
    const serializedArgs = borsh.serialize(schema, dataObj);
    
    // Combine discriminator and serialized args
    const instructionData = Buffer.concat([discriminator, serializedArgs]);
    
    // Create instruction - accounts must match Initialize struct
    const accounts = [
      { pubkey: VAULT_PDA, isSigner: false, isWritable: true }, // vault (PDA to be created)
      { pubkey: MINT_ADDRESS, isSigner: false, isWritable: false }, // mint
      { pubkey: OWNER_WALLET, isSigner: true, isWritable: false }, // owner (signer)
      { pubkey: TREASURY_WALLET, isSigner: false, isWritable: false }, // treasury
      { pubkey: KEEPER_WALLET, isSigner: false, isWritable: false }, // keeper
      { pubkey: deployer.publicKey, isSigner: true, isWritable: true }, // payer (signer)
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false } // system_program
    ];
    
    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: ABSOLUTE_VAULT_PROGRAM_ID,
      data: instructionData
    });
    
    // Send transaction
    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [deployer],
      { commitment: 'confirmed' }
    );
    
    console.log('✅ Vault initialized:', signature);
    console.log('   - Treasury:', TREASURY_WALLET.toString());
    console.log('   - Owner:', OWNER_WALLET.toString());
    console.log('   - Keeper:', KEEPER_WALLET.toString());
    console.log('   - Harvest Threshold:', HARVEST_THRESHOLD.toString());
    
  } catch (error) {
    throw new Error(`Vault initialization failed: ${error.message}`);
  }
}

async function initializeTransferHook() {
  try {
    // Calculate hook config PDA
    const [hookConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('hook-config'), MINT_ADDRESS.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID
    );
    
    // Check if hook config already exists
    try {
      const hookInfo = await connection.getAccountInfo(hookConfigPda);
      if (hookInfo && hookInfo.owner.equals(TRANSFER_HOOK_PROGRAM_ID)) {
        console.log('   ✅ Transfer Hook already initialized, skipping...');
        return;
      }
    } catch (e) {
      // Account doesn't exist, proceed with initialization
    }
    
    // Calculate discriminator for 'initialize' instruction
    const discriminator = calculateDiscriminator('global', 'initialize');
    
    // Define class for borsh serialization
    class InitializeHookData {
      constructor(fields) {
        this.totalSupply = fields.totalSupply;
      }
    }
    
    // Create Map-based schema for borsh v0.7.0
    const schema = new Map([
      [InitializeHookData, {
        kind: 'struct',
        fields: [
          ['totalSupply', 'u64']
        ]
      }]
    ]);
    
    // Create data instance
    const dataObj = new InitializeHookData({
      totalSupply: BigInt(tokenInfo.totalSupplyRaw) // Use the raw value (1B * 10^9)
    });
    
    // Serialize using Map-based schema
    const serializedArgs = borsh.serialize(schema, dataObj);
    
    // Combine discriminator and serialized args
    const instructionData = Buffer.concat([discriminator, serializedArgs]);
    
    // Create instruction - accounts must match Initialize struct
    const accounts = [
      { pubkey: hookConfigPda, isSigner: false, isWritable: true }, // hook_config (PDA to be created)
      { pubkey: MINT_ADDRESS, isSigner: false, isWritable: false }, // mint
      { pubkey: deployer.publicKey, isSigner: true, isWritable: false }, // authority (signer)
      { pubkey: deployer.publicKey, isSigner: true, isWritable: true }, // payer (signer)
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false } // system_program
    ];
    
    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: TRANSFER_HOOK_PROGRAM_ID,
      data: instructionData
    });
    
    // Send transaction
    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [deployer],
      { commitment: 'confirmed' }
    );
    
    console.log('✅ Transfer Hook initialized:', signature);
    console.log('   - Config PDA:', hookConfigPda.toString());
    console.log('   - Launch time: 0 (not launched)');
    console.log('   - Hook is active but won\'t limit transfers until launch');
    
  } catch (error) {
    throw new Error(`Transfer Hook initialization failed: ${error.message}`);
  }
}

async function initializeTransferHookExtraAccountMetas() {
  try {
    // Calculate extra account metas PDA
    const [extraAccountMetasPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('extra-account-metas'), MINT_ADDRESS.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID
    );
    
    // Check if already initialized
    try {
      const metasInfo = await connection.getAccountInfo(extraAccountMetasPda);
      if (metasInfo && metasInfo.owner.equals(TRANSFER_HOOK_PROGRAM_ID)) {
        console.log('   ✅ Transfer Hook Extra Account Metas already initialized, skipping...');
        return;
      }
    } catch (e) {
      // Account doesn't exist, proceed with initialization
    }
    
    // Calculate discriminator for 'initialize_extra_account_metas' instruction
    const discriminator = calculateDiscriminator('global', 'initialize_extra_account_metas');
    
    // No parameters for this instruction
    const instructionData = discriminator;
    
    // Create instruction - accounts must match InitializeExtraAccountMetas struct
    const accounts = [
      { pubkey: extraAccountMetasPda, isSigner: false, isWritable: true }, // extra_account_metas (PDA to be created)
      { pubkey: MINT_ADDRESS, isSigner: false, isWritable: false }, // mint
      { pubkey: deployer.publicKey, isSigner: true, isWritable: false }, // authority (signer)
      { pubkey: deployer.publicKey, isSigner: true, isWritable: true }, // payer (signer)
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false } // system_program
    ];
    
    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: TRANSFER_HOOK_PROGRAM_ID,
      data: instructionData
    });
    
    // Send transaction
    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [deployer],
      { commitment: 'confirmed' }
    );
    
    console.log('   ✅ Transfer Hook Extra Account Metas initialized:', signature);
    
  } catch (error) {
    throw new Error(`Transfer Hook Extra Account Metas initialization failed: ${error.message}`);
  }
}

async function initializeSmartDial() {
  try {
    // Calculate dial state PDA
    const [dialStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('smart-dial')],
      SMART_DIAL_PROGRAM_ID
    );
    
    // Check if dial state already exists
    try {
      const dialInfo = await connection.getAccountInfo(dialStatePda);
      if (dialInfo && dialInfo.owner.equals(SMART_DIAL_PROGRAM_ID)) {
        console.log('   ✅ Smart Dial already initialized, skipping...');
        return;
      }
    } catch (e) {
      // Account doesn't exist, proceed with initialization
    }
    
    // Native SOL mint address
    const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
    
    // Calculate discriminator for 'initialize' instruction
    const discriminator = calculateDiscriminator('global', 'initialize');
    
    // Define class for borsh serialization
    class InitializeDialData {
      constructor(fields) {
        this.initialRewardToken = fields.initialRewardToken;
        this.treasury = fields.treasury;
      }
    }
    
    // Create Map-based schema for borsh v0.7.0
    const schema = new Map([
      [InitializeDialData, {
        kind: 'struct',
        fields: [
          ['initialRewardToken', [32]], // 32 bytes for Pubkey
          ['treasury', [32]] // 32 bytes for Pubkey
        ]
      }]
    ]);
    
    // Create data instance
    const dataObj = new InitializeDialData({
      initialRewardToken: Array.from(SOL_MINT.toBuffer()),
      treasury: Array.from(TREASURY_WALLET.toBuffer())
    });
    
    // Serialize using Map-based schema
    const serializedArgs = borsh.serialize(schema, dataObj);
    
    // Combine discriminator and serialized args
    const instructionData = Buffer.concat([discriminator, serializedArgs]);
    
    // Create instruction
    const accounts = [
      { pubkey: deployer.publicKey, isSigner: true, isWritable: true },
      { pubkey: dialStatePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ];
    
    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: SMART_DIAL_PROGRAM_ID,
      data: instructionData
    });
    
    // Send transaction
    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [deployer],
      { commitment: 'confirmed' }
    );
    
    console.log('   ✅ Smart Dial initialized:', signature);
    console.log('   - Initial reward token: SOL');
    console.log('   - Treasury:', TREASURY_WALLET.toString());
    console.log('   - Dial State PDA:', dialStatePda.toString());
    
  } catch (error) {
    throw new Error(`Smart Dial initialization failed: ${error.message}`);
  }
}

async function transferAuthorities() {
  try {
    // Get current mint info
    const mintInfo = await getMint(connection, MINT_ADDRESS, 'confirmed', TOKEN_2022_PROGRAM_ID);
    
    // Check current authorities first
    const transferFeeConfig = await getTransferFeeConfig(mintInfo);
    const transferHook = await getTransferHook(mintInfo);
    
    console.log('   📊 Current Authorities:');
    console.log('   - Fee Config Authority:', transferFeeConfig?.transferFeeConfigAuthority?.toString() || 'null');
    console.log('   - Withdraw Authority:', transferFeeConfig?.withdrawWithheldAuthority?.toString() || 'null');
    console.log('   - Hook Authority:', transferHook?.authority?.toString() || 'null');
    
    // Check if already transferred
    if (transferFeeConfig?.transferFeeConfigAuthority?.equals(VAULT_PDA) &&
        transferFeeConfig?.withdrawWithheldAuthority?.equals(VAULT_PDA) &&
        transferHook?.authority?.equals(VAULT_PDA)) {
      console.log('   ✅ All authorities already transferred to Vault PDA');
      return;
    }
    
    // 1. Transfer Fee Config Authority
    console.log('   - Transferring fee config authority...');
    const transferFeeConfigTx = await setAuthority(
      connection,
      deployer,
      MINT_ADDRESS,
      deployer.publicKey,
      AuthorityType.TransferFeeConfig,
      VAULT_PDA,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log('     ✅ Fee config authority transferred:', transferFeeConfigTx);
    
    // 2. Transfer Withdraw Withheld Authority
    console.log('   - Transferring withdraw withheld authority...');
    const transferWithdrawTx = await setAuthority(
      connection,
      deployer,
      MINT_ADDRESS,
      deployer.publicKey,
      AuthorityType.WithheldWithdraw,
      VAULT_PDA,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log('     ✅ Withdraw withheld authority transferred:', transferWithdrawTx);
    
    // 3. Transfer Hook Authority
    console.log('   - Transferring transfer hook authority...');
    const transferHookTx = await setAuthority(
      connection,
      deployer,
      MINT_ADDRESS,
      deployer.publicKey,
      AuthorityType.TransferHookProgramId,
      VAULT_PDA,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log('     ✅ Transfer hook authority transferred:', transferHookTx);
    
    // Verify all authorities transferred
    const updatedMintInfo = await getMint(connection, MINT_ADDRESS, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const updatedFeeConfig = await getTransferFeeConfig(updatedMintInfo);
    const updatedHook = await getTransferHook(updatedMintInfo);
    
    console.log('\n   📊 Authority Verification:');
    console.log('   - Fee Config Authority:', updatedFeeConfig?.transferFeeConfigAuthority?.toString());
    console.log('   - Withdraw Authority:', updatedFeeConfig?.withdrawWithheldAuthority?.toString());
    console.log('   - Hook Authority:', updatedHook?.authority?.toString());
    
  } catch (error) {
    throw new Error(`Authority transfer failed: ${error.message}`);
  }
}

async function testTransferFee() {
  try {
    // Generate test recipient
    const recipient = Keypair.generate();
    console.log('   - Test recipient:', recipient.publicKey.toString());
    
    // Get deployer token account
    const deployerTokenAccount = getAssociatedTokenAddressSync(
      MINT_ADDRESS,
      deployer.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    // Create recipient token account
    const recipientTokenAccount = getAssociatedTokenAddressSync(
      MINT_ADDRESS,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    const createATAIx = createAssociatedTokenAccountInstruction(
      deployer.publicKey,
      recipientTokenAccount,
      recipient.publicKey,
      MINT_ADDRESS,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    // Transfer 1000 MIKO
    const transferAmount = BigInt(1000 * 10 ** 9);
    console.log('   - Transfer amount:', 1000, 'MIKO');
    console.log('   - Expected fee (30%):', 300, 'MIKO');
    console.log('   - Expected received:', 700, 'MIKO');
    
    // Get initial balance
    const initialBalance = await getAccount(
      connection,
      deployerTokenAccount,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    
    // Create transfer instruction
    const transferIx = createTransferCheckedInstruction(
      deployerTokenAccount,
      MINT_ADDRESS,
      recipientTokenAccount,
      deployer.publicKey,
      transferAmount,
      9,
      [],
      TOKEN_2022_PROGRAM_ID
    );
    
    // Send transaction
    const transaction = new Transaction().add(createATAIx, transferIx);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [deployer],
      { commitment: 'confirmed' }
    );
    console.log('   - Transaction:', signature);
    
    // Check final balances
    const recipientBalance = await getAccount(
      connection,
      recipientTokenAccount,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    
    const receivedAmount = Number(recipientBalance.amount) / (10 ** 9);
    console.log('   - Recipient received:', receivedAmount, 'MIKO');
    
    if (Math.abs(receivedAmount - 700) < 0.01) {
      console.log('   ✅ Transfer fee working correctly at 30%!');
    } else {
      throw new Error('Transfer fee not working as expected');
    }
    
  } catch (error) {
    throw new Error(`Transfer fee test failed: ${error.message}`);
  }
}

async function revokeMintAuthority() {
  try {
    // Get current mint info
    const mintInfo = await getMint(connection, MINT_ADDRESS, 'confirmed', TOKEN_2022_PROGRAM_ID);
    
    console.log('   Current mint authority:', mintInfo.mintAuthority?.toString() || 'null');
    
    if (!mintInfo.mintAuthority) {
      console.log('   ✅ Mint authority already revoked');
      return;
    }
    
    // Revoke mint authority
    const revokeTx = await setAuthority(
      connection,
      deployer,
      MINT_ADDRESS,
      deployer.publicKey,
      AuthorityType.MintTokens,
      null,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log('   ✅ Mint authority revoked:', revokeTx);
    
    // Verify revocation
    const updatedMintInfo = await getMint(connection, MINT_ADDRESS, 'confirmed', TOKEN_2022_PROGRAM_ID);
    if (updatedMintInfo.mintAuthority === null) {
      console.log('   ✅ Verified: Mint authority is permanently null');
    } else {
      throw new Error('Mint authority revocation failed');
    }
    
  } catch (error) {
    throw new Error(`Mint authority revocation failed: ${error.message}`);
  }
}

// Save updated system info
async function saveSystemInfo() {
  const systemInfo = {
    ...tokenInfo,
    vaultPda: VAULT_PDA.toString(),
    vaultInitialized: true,
    transferHookInitialized: false,
    smartDialInitialized: false,
    authorities: {
      mintAuthority: null,
      freezeAuthority: null,
      transferFeeConfigAuthority: VAULT_PDA.toString(),
      withdrawWithheldAuthority: VAULT_PDA.toString(),
      transferHookAuthority: VAULT_PDA.toString()
    },
    systemWallets: {
      treasury: TREASURY_WALLET.toString(),
      owner: OWNER_WALLET.toString(),
      keeper: KEEPER_WALLET.toString()
    },
    phase: "Phase 3 Complete - System initialized, authorities transferred, mint revoked",
    updatedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(tokenInfoPath, JSON.stringify(systemInfo, null, 2));
  console.log('\n📁 System info updated in shared-artifacts');
}

// Main execution
initializeSystem()
  .then(() => saveSystemInfo())
  .catch(console.error);