import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  PublicKey,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  getMintLen,
  createInitializeTransferFeeConfigInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

async function createMikoToken() {
  // Connect to devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load wallet from keypair file
  const walletPath = process.env.ANCHOR_WALLET || '/root/.config/solana/id.json';
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );
  
  console.log('Using wallet:', walletKeypair.publicKey.toBase58());
  
  // Check balance
  const balance = await connection.getBalance(walletKeypair.publicKey);
  console.log('Wallet balance:', balance / 1e9, 'SOL');
  
  if (balance < 0.1 * 1e9) {
    console.error('Insufficient balance. Please airdrop SOL to your wallet first.');
    process.exit(1);
  }
  
  // Generate new mint keypair
  const mintKeypair = Keypair.generate();
  console.log('MIKO Token mint address:', mintKeypair.publicKey.toBase58());
  
  // Calculate mint account size with transfer fee extension
  const extensions = [ExtensionType.TransferFeeConfig];
  const mintLen = getMintLen(extensions);
  
  // Calculate rent
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
  
  // Create mint account
  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: walletKeypair.publicKey,
    newAccountPubkey: mintKeypair.publicKey,
    space: mintLen,
    lamports,
    programId: TOKEN_2022_PROGRAM_ID,
  });
  
  // Initialize transfer fee config (5% = 500 basis points)
  const transferFeeBasisPoints = 500; // 5%
  const maxFee = BigInt('18446744073709551615'); // u64::MAX - no upper limit
  
  const initTransferFeeIx = createInitializeTransferFeeConfigInstruction(
    mintKeypair.publicKey,
    walletKeypair.publicKey, // Transfer fee config authority
    walletKeypair.publicKey, // Withdraw withheld authority
    transferFeeBasisPoints,
    maxFee,
    TOKEN_2022_PROGRAM_ID
  );
  
  // Initialize mint with 9 decimals (standard for SPL tokens)
  const initMintIx = createInitializeMintInstruction(
    mintKeypair.publicKey,
    9, // decimals
    walletKeypair.publicKey, // mint authority
    walletKeypair.publicKey, // freeze authority
    TOKEN_2022_PROGRAM_ID
  );
  
  // Create and send transaction
  const transaction = new Transaction().add(
    createAccountIx,
    initTransferFeeIx,
    initMintIx
  );
  
  console.log('Creating MIKO token with 5% transfer fee...');
  const txSig = await sendAndConfirmTransaction(
    connection,
    transaction,
    [walletKeypair, mintKeypair],
    { commitment: 'confirmed' }
  );
  
  console.log('Transaction signature:', txSig);
  console.log('MIKO token created successfully\!');
  
  // Now revoke the transfer fee config authority to make it permanent
  console.log('Revoking transfer fee config authority to make 5% fee permanent...');
  
  const revokeAuthorityIx = createSetAuthorityInstruction(
    mintKeypair.publicKey,
    walletKeypair.publicKey,
    AuthorityType.TransferFeeConfig,
    null, // Set to null to revoke
    [],
    TOKEN_2022_PROGRAM_ID
  );
  
  const revokeTx = new Transaction().add(revokeAuthorityIx);
  const revokeSig = await sendAndConfirmTransaction(
    connection,
    revokeTx,
    [walletKeypair],
    { commitment: 'confirmed' }
  );
  
  console.log('Revoke authority transaction:', revokeSig);
  console.log('Transfer fee authority revoked\! The 5% fee is now permanent.');
  
  // Save token info to file
  const tokenInfo = {
    mint: mintKeypair.publicKey.toBase58(),
    decimals: 9,
    transferFeeBasisPoints: 500,
    transferFeePercentage: '5%',
    authority: walletKeypair.publicKey.toBase58(),
    createdAt: new Date().toISOString(),
    network: 'devnet',
  };
  
  fs.writeFileSync(
    path.join(__dirname, '..', 'miko-token-info.json'),
    JSON.stringify(tokenInfo, null, 2)
  );
  
  console.log('\nToken information saved to miko-token-info.json');
  console.log('Token details:', tokenInfo);
}

// Run the script
createMikoToken().catch(console.error);
