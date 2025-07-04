import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  getMintLen,
  createInitializeTransferFeeConfigInstruction,
  getTransferFeeConfig,
  createWithdrawWithheldTokensFromMintInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
  getAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  mintTo,
  transferChecked,
  TOKEN_PROGRAM_ID,
  getMint,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Constants
const DECIMALS = 9;
const TRANSFER_FEE_BASIS_POINTS = 500; // 5%
const MAX_FEE = BigInt(Number.MAX_SAFE_INTEGER); // No upper limit on fee

async function createMikoToken() {
  console.log('🚀 Starting MIKO Token creation with 5% transfer fee...\n');

  // Load environment and establish connection
  const rpcUrl = process.env.SOLANA_RPC_URL || 'http://localhost:8899';
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Load or create wallets
  const payerKeypair = loadKeypair(process.env.PAYER_KEYPAIR_PATH || '~/.config/solana/id.json');
  const mintKeypair = Keypair.generate();
  const transferFeeConfigAuthority = payerKeypair; // Initially set to payer, will be revoked later
  const withdrawWithheldAuthority = payerKeypair;

  console.log('📋 Configuration:');
  console.log(`  RPC URL: ${rpcUrl}`);
  console.log(`  Payer: ${payerKeypair.publicKey.toBase58()}`);
  console.log(`  Mint: ${mintKeypair.publicKey.toBase58()}`);
  console.log(`  Decimals: ${DECIMALS}`);
  console.log(`  Transfer Fee: ${TRANSFER_FEE_BASIS_POINTS / 100}% (${TRANSFER_FEE_BASIS_POINTS} basis points)`);
  console.log(`  Max Fee: No limit\n`);

  try {
    // Check payer balance
    const balance = await connection.getBalance(payerKeypair.publicKey);
    console.log(`💰 Payer balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    
    if (balance < 0.1 * LAMPORTS_PER_SOL) {
      throw new Error('Insufficient SOL balance. Need at least 0.1 SOL');
    }

    // Calculate mint account size with transfer fee extension
    const extensions = [ExtensionType.TransferFeeConfig];
    const mintLen = getMintLen(extensions);
    const mintRent = await connection.getMinimumBalanceForRentExemption(mintLen);

    console.log(`📦 Mint account size: ${mintLen} bytes`);
    console.log(`💵 Rent exemption: ${mintRent / LAMPORTS_PER_SOL} SOL\n`);

    // Create mint account
    console.log('1️⃣ Creating mint account...');
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: payerKeypair.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      lamports: mintRent,
      space: mintLen,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    // Initialize transfer fee config
    console.log('2️⃣ Initializing transfer fee configuration...');
    const initTransferFeeIx = createInitializeTransferFeeConfigInstruction(
      mintKeypair.publicKey,
      transferFeeConfigAuthority.publicKey,
      withdrawWithheldAuthority.publicKey,
      TRANSFER_FEE_BASIS_POINTS,
      MAX_FEE,
      TOKEN_2022_PROGRAM_ID
    );

    // Initialize mint
    console.log('3️⃣ Initializing mint...');
    const initMintIx = createInitializeMintInstruction(
      mintKeypair.publicKey,
      DECIMALS,
      payerKeypair.publicKey, // mint authority
      payerKeypair.publicKey, // freeze authority
      TOKEN_2022_PROGRAM_ID
    );

    // Create and send transaction
    const transaction = new Transaction().add(
      createAccountIx,
      initTransferFeeIx,
      initMintIx
    );

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payerKeypair, mintKeypair],
      { commitment: 'confirmed' }
    );

    console.log(`✅ Token created! Signature: ${signature}`);
    console.log(`🪙 Mint address: ${mintKeypair.publicKey.toBase58()}\n`);

    // Verify transfer fee config
    console.log('4️⃣ Verifying transfer fee configuration...');
    const mintInfo = await getMint(
      connection,
      mintKeypair.publicKey,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );

    const transferFeeConfig = getTransferFeeConfig(mintInfo);
    if (!transferFeeConfig) {
      throw new Error('Transfer fee config not found');
    }

    console.log('✅ Transfer fee config verified:');
    console.log(`  Fee: ${transferFeeConfig.newerTransferFee.transferFeeBasisPoints} basis points`);
    console.log(`  Max Fee: ${transferFeeConfig.newerTransferFee.maximumFee.toString()}`);
    console.log(`  Config Authority: ${transferFeeConfig.transferFeeConfigAuthority?.toBase58() || 'None'}`);
    console.log(`  Withdraw Authority: ${transferFeeConfig.withdrawWithheldAuthority?.toBase58() || 'None'}\n`);

    // Revoke transfer fee config authority to make the 5% fee immutable
    console.log('5️⃣ Revoking transfer fee config authority (making 5% fee permanent)...');
    const revokeAuthorityIx = createSetAuthorityInstruction(
      mintKeypair.publicKey,
      transferFeeConfigAuthority.publicKey,
      AuthorityType.TransferFeeConfig,
      null, // Set to null to revoke
      [],
      TOKEN_2022_PROGRAM_ID
    );

    const revokeTransaction = new Transaction().add(revokeAuthorityIx);
    const revokeSignature = await sendAndConfirmTransaction(
      connection,
      revokeTransaction,
      [payerKeypair],
      { commitment: 'confirmed' }
    );

    console.log(`✅ Authority revoked! Signature: ${revokeSignature}`);
    console.log('🔒 The 5% transfer fee is now permanently fixed and cannot be changed.\n');

    // Save mint keypair for future use
    const outputDir = path.join(process.cwd(), 'keys');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const mintKeyPath = path.join(outputDir, 'miko-mint.json');
    fs.writeFileSync(mintKeyPath, JSON.stringify(Array.from(mintKeypair.secretKey)));
    console.log(`💾 Mint keypair saved to: ${mintKeyPath}`);

    // Save token info
    const tokenInfo = {
      mint: mintKeypair.publicKey.toBase58(),
      decimals: DECIMALS,
      transferFeeBasisPoints: TRANSFER_FEE_BASIS_POINTS,
      transferFeePercentage: TRANSFER_FEE_BASIS_POINTS / 100,
      maxFee: 'unlimited',
      transferFeeConfigAuthority: 'revoked',
      withdrawWithheldAuthority: withdrawWithheldAuthority.publicKey.toBase58(),
      createdAt: new Date().toISOString(),
      network: rpcUrl.includes('devnet') ? 'devnet' : rpcUrl.includes('mainnet') ? 'mainnet-beta' : 'localnet',
    };

    const infoPath = path.join(outputDir, 'miko-token-info.json');
    fs.writeFileSync(infoPath, JSON.stringify(tokenInfo, null, 2));
    console.log(`📄 Token info saved to: ${infoPath}\n`);

    console.log('🎉 MIKO Token creation complete!');
    console.log('✨ The token now has a permanent 5% transfer fee that cannot be changed.');

    return {
      mint: mintKeypair.publicKey,
      tokenInfo,
    };

  } catch (error) {
    console.error('❌ Error creating token:', error);
    throw error;
  }
}

function loadKeypair(keypairPath: string): Keypair {
  const resolvedPath = keypairPath.replace('~', process.env.HOME || '');
  try {
    const keypairData = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(keypairData));
  } catch (error) {
    console.error(`Failed to load keypair from ${resolvedPath}`);
    throw error;
  }
}

// Run the script
if (require.main === module) {
  createMikoToken()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

export { createMikoToken };