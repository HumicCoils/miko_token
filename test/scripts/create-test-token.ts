import { 
  Connection, 
  Keypair, 
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  getMintLen,
  ExtensionType,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import * as fs from 'fs';

async function createTestToken() {
  console.log('Creating MIKO test token for devnet...');
  
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load payer wallet
  const payerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('./test-wallet.json', 'utf-8')))
  );
  
  console.log('Payer:', payerKeypair.publicKey.toBase58());
  
  // Generate mint keypair
  const mintKeypair = Keypair.generate();
  console.log('Token mint:', mintKeypair.publicKey.toBase58());
  
  // Get fee authorities from Absolute Vault
  const ABSOLUTE_VAULT_PROGRAM = new PublicKey(process.env.ABSOLUTE_VAULT_PROGRAM!);
  
  const [feeAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('fee_authority')],
    ABSOLUTE_VAULT_PROGRAM
  );
  
  const [withdrawAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('withdraw_authority')],
    ABSOLUTE_VAULT_PROGRAM
  );
  
  console.log('Fee authority:', feeAuthority.toBase58());
  console.log('Withdraw authority:', withdrawAuthority.toBase58());
  
  // Create mint with transfer fee
  const extensions = [ExtensionType.TransferFeeConfig];
  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
  
  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: payerKeypair.publicKey,
    newAccountPubkey: mintKeypair.publicKey,
    space: mintLen,
    lamports,
    programId: TOKEN_2022_PROGRAM_ID,
  });
  
  const initTransferFeeIx = createInitializeTransferFeeConfigInstruction(
    mintKeypair.publicKey,
    feeAuthority,
    withdrawAuthority,
    500,  // 5% = 500 basis points
    BigInt(Number.MAX_SAFE_INTEGER),
    TOKEN_2022_PROGRAM_ID
  );
  
  const initMintIx = createInitializeMintInstruction(
    mintKeypair.publicKey,
    9, // decimals
    payerKeypair.publicKey, // mint authority
    null, // freeze authority
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
    [payerKeypair, mintKeypair]
  );
  
  console.log('Token created! Transaction:', signature);
  
  // Mint initial supply to treasury
  const treasuryWallet = new PublicKey(process.env.TREASURY_WALLET!);
  const treasuryAta = await getAssociatedTokenAddress(
    mintKeypair.publicKey,
    treasuryWallet,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  // Create treasury ATA
  const createAtaIx = createAssociatedTokenAccountInstruction(
    payerKeypair.publicKey,
    treasuryAta,
    treasuryWallet,
    mintKeypair.publicKey,
    TOKEN_2022_PROGRAM_ID
  );
  
  // Mint 1 billion tokens
  const mintAmount = 1_000_000_000 * 10 ** 9; // 1B with 9 decimals
  const mintToIx = createMintToInstruction(
    mintKeypair.publicKey,
    treasuryAta,
    payerKeypair.publicKey,
    mintAmount,
    [],
    TOKEN_2022_PROGRAM_ID
  );
  
  const mintTx = new Transaction().add(createAtaIx, mintToIx);
  const mintSig = await sendAndConfirmTransaction(
    connection,
    mintTx,
    [payerKeypair]
  );
  
  console.log('Minted initial supply! Transaction:', mintSig);
  
  // Save mint info
  const tokenInfo = {
    mint: mintKeypair.publicKey.toBase58(),
    decimals: 9,
    supply: mintAmount,
    feeAuthority: feeAuthority.toBase58(),
    withdrawAuthority: withdrawAuthority.toBase58(),
    transferFeeBasisPoints: 500,
  };
  
  fs.writeFileSync('./test-token-info.json', JSON.stringify(tokenInfo, null, 2));
  console.log('Token info saved to test-token-info.json');
  
  console.log('\nAdd this to your .env.test:');
  console.log(`MIKO_TOKEN_MINT=${mintKeypair.publicKey.toBase58()}`);
}

createTestToken().catch(console.error);