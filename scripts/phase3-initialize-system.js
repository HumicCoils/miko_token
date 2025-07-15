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
const anchor = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

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

// Extract program IDs
const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey(programs.absoluteVault.programId);
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(programs.transferHook.programId);
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
const TREASURY_WALLET = deployer.publicKey; // Should be different in production
const OWNER_WALLET = deployer.publicKey; // Should be different in production
const KEEPER_WALLET = deployer.publicKey; // Should be different in production

// Constants
const HARVEST_THRESHOLD = BigInt(500000 * 10 ** 9); // 500k MIKO with 9 decimals
const MIN_HOLD_AMOUNT = BigInt(100 * 10 ** 9); // $100 worth - placeholder value

async function initializeSystem() {
  console.log('🚀 Phase 3: System Initialization & Authority Transfer');
  console.log('=====================================================\n');
  
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
    // Load Absolute Vault IDL
    const idlPath = '/workspace/programs/target/idl/absolute_vault.json';
    if (!fs.existsSync(idlPath)) {
      throw new Error('Absolute Vault IDL not found. Make sure programs are built.');
    }
    
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    const program = new anchor.Program(idl, ABSOLUTE_VAULT_PROGRAM_ID, { connection });
    
    // Initialize vault
    const tx = await program.methods
      .initialize(
        TREASURY_WALLET,
        OWNER_WALLET,
        MIN_HOLD_AMOUNT,
        KEEPER_WALLET,
        HARVEST_THRESHOLD
      )
      .accounts({
        authority: deployer.publicKey,
        tokenMint: MINT_ADDRESS,
        vault: VAULT_PDA,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([deployer])
      .rpc();
    
    console.log('✅ Vault initialized:', tx);
    console.log('   - Treasury:', TREASURY_WALLET.toString());
    console.log('   - Owner:', OWNER_WALLET.toString());
    console.log('   - Keeper:', KEEPER_WALLET.toString());
    console.log('   - Harvest Threshold:', HARVEST_THRESHOLD.toString());
    
    // Verify auto-exclusions
    const vaultAccount = await program.account.vaultState.fetch(VAULT_PDA);
    console.log('   - Fee exclusions count:', vaultAccount.feeExclusions.length);
    console.log('   - Reward exclusions count:', vaultAccount.rewardExclusions.length);
    
  } catch (error) {
    throw new Error(`Vault initialization failed: ${error.message}`);
  }
}

async function initializeTransferHook() {
  try {
    // Load Transfer Hook IDL
    const idlPath = '/workspace/programs/target/idl/transfer_hook.json';
    if (!fs.existsSync(idlPath)) {
      throw new Error('Transfer Hook IDL not found. Make sure programs are built.');
    }
    
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    const program = new anchor.Program(idl, TRANSFER_HOOK_PROGRAM_ID, { connection });
    
    // Calculate hook config PDA
    const [hookConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('transfer-hook-config'), MINT_ADDRESS.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID
    );
    
    // Initialize hook
    const tx = await program.methods
      .initialize(MINT_ADDRESS, new anchor.BN(tokenInfo.totalSupplyRaw))
      .accounts({
        authority: deployer.publicKey,
        config: hookConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([deployer])
      .rpc();
    
    console.log('✅ Transfer Hook initialized:', tx);
    console.log('   - Config PDA:', hookConfigPda.toString());
    console.log('   - Launch time: 0 (not launched)');
    console.log('   - Hook is active but won\'t limit transfers until launch');
    
  } catch (error) {
    throw new Error(`Transfer Hook initialization failed: ${error.message}`);
  }
}

async function transferAuthorities() {
  try {
    // Get current mint info
    const mintInfo = await getMint(connection, MINT_ADDRESS, 'confirmed', TOKEN_2022_PROGRAM_ID);
    
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

async function initializeSmartDial() {
  try {
    // Load Smart Dial IDL
    const idlPath = '/workspace/programs/target/idl/smart_dial.json';
    if (!fs.existsSync(idlPath)) {
      throw new Error('Smart Dial IDL not found. Make sure programs are built.');
    }
    
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    const program = new anchor.Program(idl, SMART_DIAL_PROGRAM_ID, { connection });
    
    // Calculate dial state PDA
    const [dialStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('dial-state')],
      SMART_DIAL_PROGRAM_ID
    );
    
    // Native SOL mint address
    const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
    
    // Initialize dial
    const tx = await program.methods
      .initialize(SOL_MINT, TREASURY_WALLET)
      .accounts({
        authority: deployer.publicKey,
        dialState: dialStatePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([deployer])
      .rpc();
    
    console.log('   ✅ Smart Dial initialized:', tx);
    console.log('   - Initial reward token: SOL');
    console.log('   - Treasury:', TREASURY_WALLET.toString());
    console.log('   - Dial State PDA:', dialStatePda.toString());
    
    // Verify initialization
    const dialState = await program.account.dialState.fetch(dialStatePda);
    console.log('   - Authority:', dialState.authority.toString());
    console.log('   - Current reward token:', dialState.currentRewardToken.toString());
    
  } catch (error) {
    throw new Error(`Smart Dial initialization failed: ${error.message}`);
  }
}

// Save updated system info
async function saveSystemInfo() {
  const systemInfo = {
    ...tokenInfo,
    vaultPda: VAULT_PDA.toString(),
    vaultInitialized: true,
    transferHookInitialized: true,
    smartDialInitialized: true,
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
    phase: "Phase 3 Complete - System initialized and ready for launch",
    updatedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(tokenInfoPath, JSON.stringify(systemInfo, null, 2));
  console.log('\n📁 System info updated in shared-artifacts');
}

// Main execution
initializeSystem()
  .then(() => saveSystemInfo())
  .catch(console.error);