import {
  Connection,
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createAccount,
  mintTo,
  transferCheckedWithFee,
  getAccount,
  getTransferFeeAmount,
} from '@solana/spl-token';
import * as fs from 'fs';

async function testTransferFee() {
  // Connect to devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load wallet and token info
  const walletPath = process.env.ANCHOR_WALLET || '/root/.config/solana/id.json';
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );
  
  const tokenInfo = JSON.parse(fs.readFileSync('/workspace/miko-token/miko-token-info.json', 'utf-8'));
  const mintPubkey = new PublicKey(tokenInfo.mint);
  
  console.log('Testing MIKO token transfer fee...');
  console.log('Mint:', mintPubkey.toBase58());
  console.log('Authority:', walletKeypair.publicKey.toBase58());
  
  // Create source token account
  console.log('\nCreating source token account...');
  const sourceAccount = await createAccount(
    connection,
    walletKeypair,
    mintPubkey,
    walletKeypair.publicKey,
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  console.log('Source account:', sourceAccount.toBase58());
  
  // Mint tokens to source account
  const mintAmount = 1000 * 10 ** tokenInfo.decimals; // 1000 tokens
  console.log('\nMinting', 1000, 'MIKO tokens to source account...');
  await mintTo(
    connection,
    walletKeypair,
    mintPubkey,
    sourceAccount,
    walletKeypair,
    mintAmount,
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  
  // Create destination account
  console.log('\nCreating destination token account...');
  const destKeypair = Keypair.generate();
  const destAccount = await createAccount(
    connection,
    walletKeypair,
    mintPubkey,
    destKeypair.publicKey,
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  console.log('Destination account:', destAccount.toBase58());
  
  // Transfer tokens with fee
  const transferAmount = 100 * 10 ** tokenInfo.decimals; // 100 tokens
  console.log('\nTransferring', 100, 'MIKO tokens...');
  console.log('Expected fee (5%):', 5, 'MIKO tokens');
  
  // Calculate expected fee based on 5% (500 basis points)
  const expectedFee = BigInt(transferAmount) * BigInt(500) / BigInt(10000);
  
  console.log('Calculated fee:', Number(expectedFee) / 10 ** tokenInfo.decimals, 'MIKO tokens');
  
  await transferCheckedWithFee(
    connection,
    walletKeypair,
    sourceAccount,
    mintPubkey,
    destAccount,
    walletKeypair,
    BigInt(transferAmount),
    tokenInfo.decimals,
    expectedFee,
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  
  // Check balances
  console.log('\nChecking balances after transfer...');
  const sourceAccountInfo = await getAccount(connection, sourceAccount, undefined, TOKEN_2022_PROGRAM_ID);
  const destAccountInfo = await getAccount(connection, destAccount, undefined, TOKEN_2022_PROGRAM_ID);
  
  console.log('Source balance:', Number(sourceAccountInfo.amount) / 10 ** tokenInfo.decimals, 'MIKO');
  console.log('Destination balance:', Number(destAccountInfo.amount) / 10 ** tokenInfo.decimals, 'MIKO');
  console.log('\nExpected destination balance:', 95, 'MIKO (100 - 5% fee)');
  
  // Verify fee was collected
  if (Number(destAccountInfo.amount) === 95 * 10 ** tokenInfo.decimals) {
    console.log('\n✅ SUCCESS: 5% transfer fee is working correctly\!');
  } else {
    console.log('\n❌ ERROR: Transfer fee not working as expected');
  }
}

// Run the test
testTransferFee().catch(console.error);
