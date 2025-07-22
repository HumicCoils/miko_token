import { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  Transaction,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getMintLen,
  ExtensionType,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  getMint,
  getTransferFeeConfig
} from '@solana/spl-token';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';

const TOKEN_DECIMALS = 9;
const TOKEN_SUPPLY = 1_000_000_000_000; // 1 trillion with 9 decimals
const INITIAL_FEE_BPS = 3000; // 30%

async function createMikoToken() {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  // Load deployer keypair
  const deployerPath = path.join(__dirname, 'phase4b-deployer.json');
  const deployerKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(deployerPath, 'utf-8')))
  );
  
  // Generate or load token mint keypair
  const tokenMintPath = path.join(__dirname, 'miko-token-keypair.json');
  let tokenMintKeypair: Keypair;
  
  if (existsSync(tokenMintPath)) {
    tokenMintKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(readFileSync(tokenMintPath, 'utf-8')))
    );
    console.log('Using existing token mint keypair:', tokenMintKeypair.publicKey.toString());
  } else {
    tokenMintKeypair = Keypair.generate();
    writeFileSync(tokenMintPath, JSON.stringify(Array.from(tokenMintKeypair.secretKey)));
    console.log('Generated new token mint keypair:', tokenMintKeypair.publicKey.toString());
  }
  
  try {
    // Check if mint already exists
    const mintInfo = await connection.getAccountInfo(tokenMintKeypair.publicKey);
    if (mintInfo) {
      console.log('Token mint already exists:', tokenMintKeypair.publicKey.toString());
      return tokenMintKeypair.publicKey;
    }
    
    // Calculate space needed for mint with transfer fee extension
    const extensions = [ExtensionType.TransferFeeConfig];
    const mintSpace = getMintLen(extensions);
    
    // Calculate rent
    const lamports = await connection.getMinimumBalanceForRentExemption(mintSpace);
    
    // Create mint account
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: deployerKeypair.publicKey,
      newAccountPubkey: tokenMintKeypair.publicKey,
      lamports,
      space: mintSpace,
      programId: TOKEN_2022_PROGRAM_ID,
    });
    
    // Initialize transfer fee config
    const transferFeeConfigIx = createInitializeTransferFeeConfigInstruction(
      tokenMintKeypair.publicKey,
      deployerKeypair.publicKey, // transferFeeConfigAuthority
      deployerKeypair.publicKey, // withdrawWithheldAuthority
      INITIAL_FEE_BPS,
      BigInt(TOKEN_SUPPLY),
      TOKEN_2022_PROGRAM_ID
    );
    
    // Initialize mint
    const initializeMintIx = createInitializeMintInstruction(
      tokenMintKeypair.publicKey,
      TOKEN_DECIMALS,
      deployerKeypair.publicKey, // mintAuthority
      deployerKeypair.publicKey, // freezeAuthority
      TOKEN_2022_PROGRAM_ID
    );
    
    // Create and send transaction
    const transaction = new Transaction().add(
      createAccountIx,
      transferFeeConfigIx,
      initializeMintIx
    );
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [deployerKeypair, tokenMintKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log('\nMIKO Token created successfully!');
    console.log('Token Mint:', tokenMintKeypair.publicKey.toString());
    console.log('Transaction:', signature);
    
    // Verify the mint was created correctly
    const mint = await getMint(connection, tokenMintKeypair.publicKey, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('\nMint Details:');
    console.log('- Decimals:', mint.decimals);
    console.log('- Supply:', mint.supply.toString());
    console.log('- Mint Authority:', mint.mintAuthority?.toString() || 'None');
    
    // Get transfer fee config
    const transferFeeConfig = getTransferFeeConfig(mint);
    if (transferFeeConfig) {
      console.log('\nTransfer Fee Config:');
      console.log('- Fee BPS:', transferFeeConfig.newerTransferFee.transferFeeBasisPoints);
      console.log('- Max Fee:', transferFeeConfig.newerTransferFee.maximumFee.toString());
      console.log('- Config Authority:', transferFeeConfig.transferFeeConfigAuthority?.toString());
      console.log('- Withdraw Authority:', transferFeeConfig.withdrawWithheldAuthority?.toString());
    }
    
    // Update config file
    const configPath = path.join(__dirname, 'phase4b-config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    config.mikoToken = tokenMintKeypair.publicKey.toString();
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    return tokenMintKeypair.publicKey;
  } catch (error) {
    console.error('Error creating MIKO token:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createMikoToken()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { createMikoToken };