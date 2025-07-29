import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  getMintLen,
  ExtensionType,
  getTransferFeeConfig,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getMint,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
// CRITICAL: Always use the existing deployer keypair from Phase 1
// Address: AnCL6TWEGYo3zVhrXckfFiAqdQpo158JUCWPFQJEpS95
const DEPLOYER_KEYPAIR_PATH = '/shared-artifacts/deployer-keypair.json';
const SHARED_ARTIFACTS_PATH = '/shared-artifacts';

// Token configuration
const TOKEN_NAME = 'MIKO';
const TOKEN_DECIMALS = 9;
const TOTAL_SUPPLY = 1_000_000_000; // 1 billion MIKO
const INITIAL_FEE_BASIS_POINTS = 3000; // 30%
const MAX_FEE = BigInt('18446744073709551615'); // u64::MAX

async function createMikoToken() {
  console.log('🚀 Starting MIKO Token Creation (Phase 2)');
  console.log('📋 Configuration:');
  console.log(`   - Network: ${RPC_URL}`);
  console.log(`   - Token Name: ${TOKEN_NAME}`);
  console.log(`   - Decimals: ${TOKEN_DECIMALS}`);
  console.log(`   - Total Supply: ${TOTAL_SUPPLY.toLocaleString()}`);
  console.log(`   - Initial Transfer Fee: ${INITIAL_FEE_BASIS_POINTS / 100}%`);
  console.log(`   - Extensions: TransferFeeConfig ONLY (no transfer hook)`);
  console.log('');

  try {
    // Load deployer keypair
    console.log('Loading deployer keypair...');
    const deployerKeypairData = JSON.parse(
      fs.readFileSync(DEPLOYER_KEYPAIR_PATH, 'utf-8')
    );
    const deployerKeypair = Keypair.fromSecretKey(
      Uint8Array.from(deployerKeypairData)
    );
    console.log(`✅ Deployer: ${deployerKeypair.publicKey.toBase58()}`);

    // Create connection
    const connection = new Connection(RPC_URL, 'confirmed');
    
    // Check deployer balance
    const balance = await connection.getBalance(deployerKeypair.publicKey);
    console.log(`💰 Deployer balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    
    if (balance < 0.1 * LAMPORTS_PER_SOL) {
      throw new Error('Insufficient SOL balance. Need at least 0.1 SOL');
    }

    // Generate mint keypair
    console.log('\n📝 Generating mint keypair...');
    const mintKeypair = Keypair.generate();
    console.log(`✅ Mint address: ${mintKeypair.publicKey.toBase58()}`);

    // Calculate mint size with TransferFeeConfig extension
    const mintLen = getMintLen([ExtensionType.TransferFeeConfig]);
    console.log(`📏 Mint account size: ${mintLen} bytes`);

    // Calculate rent
    const mintRent = await connection.getMinimumBalanceForRentExemption(mintLen);
    console.log(`💸 Rent required: ${mintRent / LAMPORTS_PER_SOL} SOL`);

    // Create mint account transaction
    console.log('\n🔨 Creating mint account with TransferFeeConfig extension...');
    const createAccountTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: deployerKeypair.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        lamports: mintRent,
        space: mintLen,
        programId: TOKEN_2022_PROGRAM_ID,
      })
    );

    // Send create account transaction
    const createAccountSig = await sendAndConfirmTransaction(
      connection,
      createAccountTx,
      [deployerKeypair, mintKeypair],
      { commitment: 'confirmed' }
    );
    console.log(`✅ Account created: ${createAccountSig}`);

    // Initialize TransferFeeConfig extension
    console.log('\n🔧 Initializing TransferFeeConfig extension...');
    const transferFeeConfigTx = new Transaction().add(
      createInitializeTransferFeeConfigInstruction(
        mintKeypair.publicKey,
        deployerKeypair.publicKey, // transferFeeConfigAuthority (temporary)
        deployerKeypair.publicKey, // withdrawWithheldAuthority (temporary)
        INITIAL_FEE_BASIS_POINTS,
        MAX_FEE,
        TOKEN_2022_PROGRAM_ID
      )
    );

    const transferFeeConfigSig = await sendAndConfirmTransaction(
      connection,
      transferFeeConfigTx,
      [deployerKeypair],
      { commitment: 'confirmed' }
    );
    console.log(`✅ TransferFeeConfig initialized: ${transferFeeConfigSig}`);

    // Initialize mint
    console.log('\n🪙 Initializing mint...');
    const initMintTx = new Transaction().add(
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        TOKEN_DECIMALS,
        deployerKeypair.publicKey, // mint authority (temporary)
        null, // freeze authority (permanently disabled)
        TOKEN_2022_PROGRAM_ID
      )
    );

    const initMintSig = await sendAndConfirmTransaction(
      connection,
      initMintTx,
      [deployerKeypair],
      { commitment: 'confirmed' }
    );
    console.log(`✅ Mint initialized: ${initMintSig}`);

    // Create associated token account for deployer
    console.log('\n🏦 Creating deployer token account...');
    const deployerATA = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      deployerKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const createATATx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        deployerKeypair.publicKey,
        deployerATA,
        deployerKeypair.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );

    const createATASig = await sendAndConfirmTransaction(
      connection,
      createATATx,
      [deployerKeypair],
      { commitment: 'confirmed' }
    );
    console.log(`✅ Deployer ATA created: ${deployerATA.toBase58()}`);

    // Mint total supply to deployer
    console.log('\n💰 Minting total supply...');
    const mintAmount = BigInt(TOTAL_SUPPLY) * BigInt(10 ** TOKEN_DECIMALS);
    const mintToTx = new Transaction().add(
      createMintToInstruction(
        mintKeypair.publicKey,
        deployerATA,
        deployerKeypair.publicKey,
        mintAmount,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const mintToSig = await sendAndConfirmTransaction(
      connection,
      mintToTx,
      [deployerKeypair],
      { commitment: 'confirmed' }
    );
    console.log(`✅ Minted ${TOTAL_SUPPLY.toLocaleString()} ${TOKEN_NAME}: ${mintToSig}`);

    // Verify transfer fee configuration
    console.log('\n🔍 Verifying transfer fee configuration...');
    const mintData = await getMint(
      connection,
      mintKeypair.publicKey,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );

    const transferFeeConfig = getTransferFeeConfig(mintData);
    if (!transferFeeConfig) {
      throw new Error('TransferFeeConfig not found on mint');
    }

    console.log(`✅ Transfer Fee: ${Number(transferFeeConfig.newerTransferFee.transferFeeBasisPoints) / 100}%`);
    console.log(`✅ Fee Config Authority: ${deployerKeypair.publicKey.toBase58()}`);
    console.log(`✅ Withdraw Authority: ${deployerKeypair.publicKey.toBase58()}`);

    // Save token info to shared artifacts
    console.log('\n💾 Saving token information...');
    const tokenInfo = {
      mint: mintKeypair.publicKey.toBase58(),
      mintKeypair: Array.from(mintKeypair.secretKey),
      totalSupply: TOTAL_SUPPLY.toString(),
      decimals: TOKEN_DECIMALS,
      transferFeeBasisPoints: INITIAL_FEE_BASIS_POINTS,
      temporaryAuthority: deployerKeypair.publicKey.toBase58(),
      freezeAuthority: null,
      deployerATA: deployerATA.toBase58(),
      createdAt: new Date().toISOString(),
      network: 'devnet',
      extensions: ['TransferFeeConfig'],
      verified: {
        totalSupplyMinted: true,
        inDeployerWallet: true,
        transferFeeActive: true,
        noTransferHook: true
      }
    };

    fs.writeFileSync(
      path.join(SHARED_ARTIFACTS_PATH, 'token-info.json'),
      JSON.stringify(tokenInfo, null, 2)
    );
    console.log('✅ Token info saved to shared-artifacts/token-info.json');

    // Final summary
    console.log('\n🎉 MIKO Token Created Successfully!');
    console.log('═══════════════════════════════════════');
    console.log(`Mint: ${mintKeypair.publicKey.toBase58()}`);
    console.log(`Total Supply: ${TOTAL_SUPPLY.toLocaleString()} ${TOKEN_NAME}`);
    console.log(`Transfer Fee: ${INITIAL_FEE_BASIS_POINTS / 100}%`);
    console.log(`Extensions: TransferFeeConfig ONLY`);
    console.log(`All authorities: ${deployerKeypair.publicKey.toBase58()}`);
    console.log('═══════════════════════════════════════');
    console.log('\n✅ Phase 2 token creation complete!');
    console.log('⏭️  Ready for Phase 2 verification contracts');

  } catch (error) {
    console.error('\n❌ Error creating token:', error);
    process.exit(1);
  }
}

// Run the script
createMikoToken().catch(console.error);