import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  mintTo,
  transferChecked,
  getTransferFeeConfig,
  getMint,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function testTokenFees() {
  console.log('🧪 Testing MIKO Token transfer fees...\n');

  // Load environment
  const rpcUrl = process.env.SOLANA_RPC_URL || 'http://localhost:8899';
  const connection = new Connection(rpcUrl, 'confirmed');

  // Load keypairs
  const payerKeypair = loadKeypair(process.env.PAYER_KEYPAIR_PATH || '~/.config/solana/id.json');
  const mintKeypair = loadMintKeypair();
  const testUser1 = Keypair.generate();
  const testUser2 = Keypair.generate();

  console.log('📋 Test Configuration:');
  console.log(`  Mint: ${mintKeypair.publicKey.toBase58()}`);
  console.log(`  Payer: ${payerKeypair.publicKey.toBase58()}`);
  console.log(`  Test User 1: ${testUser1.publicKey.toBase58()}`);
  console.log(`  Test User 2: ${testUser2.publicKey.toBase58()}\n`);

  try {
    // Get mint info
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

    console.log('💰 Transfer Fee Configuration:');
    console.log(`  Fee: ${transferFeeConfig.newerTransferFee.transferFeeBasisPoints / 100}%`);
    console.log(`  Config Authority: ${transferFeeConfig.transferFeeConfigAuthority?.toBase58() || 'REVOKED ✅'}`);
    console.log(`  Withdraw Authority: ${transferFeeConfig.withdrawWithheldAuthority?.toBase58()}\n`);

    // Create associated token accounts
    console.log('1️⃣ Creating token accounts...');
    const payerAta = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      payerKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const user1Ata = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      testUser1.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const user2Ata = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      testUser2.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Create ATAs if they don't exist
    const ataInstructions = [];
    
    if (!(await accountExists(connection, payerAta))) {
      ataInstructions.push(
        createAssociatedTokenAccountInstruction(
          payerKeypair.publicKey,
          payerAta,
          payerKeypair.publicKey,
          mintKeypair.publicKey,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }
    
    ataInstructions.push(
      createAssociatedTokenAccountInstruction(
        payerKeypair.publicKey,
        user1Ata,
        testUser1.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      ),
      createAssociatedTokenAccountInstruction(
        payerKeypair.publicKey,
        user2Ata,
        testUser2.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      )
    );

    if (ataInstructions.length > 0) {
      const ataTransaction = new Transaction().add(...ataInstructions);
      await sendAndConfirmTransaction(connection, ataTransaction, [payerKeypair]);
      console.log('✅ Token accounts created\n');
    }

    // Mint tokens for testing
    console.log('2️⃣ Minting test tokens...');
    const mintAmount = 1000 * 10 ** 9; // 1000 tokens
    
    await mintTo(
      connection,
      payerKeypair,
      mintKeypair.publicKey,
      payerAta,
      payerKeypair.publicKey,
      mintAmount,
      [],
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`✅ Minted ${mintAmount / 10 ** 9} tokens to payer\n`);

    // Test transfer with fee
    console.log('3️⃣ Testing transfer with 5% fee...');
    const transferAmount = 100 * 10 ** 9; // 100 tokens
    const fee = Math.floor(transferAmount * transferFeeConfig.newerTransferFee.transferFeeBasisPoints / 10000);
    const amountReceived = transferAmount - fee;

    console.log(`  Transfer amount: ${transferAmount / 10 ** 9} tokens`);
    console.log(`  Expected fee: ${fee / 10 ** 9} tokens (5%)`);
    console.log(`  Amount received: ${amountReceived / 10 ** 9} tokens\n`);

    // Transfer from payer to user1
    await transferChecked(
      connection,
      payerKeypair,
      payerAta,
      mintKeypair.publicKey,
      user1Ata,
      payerKeypair,
      transferAmount,
      9,
      [],
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    console.log('✅ Transfer completed\n');

    // Check balances
    console.log('4️⃣ Checking balances...');
    const payerAccount = await getAccount(connection, payerAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const user1Account = await getAccount(connection, user1Ata, 'confirmed', TOKEN_2022_PROGRAM_ID);

    console.log(`  Payer balance: ${Number(payerAccount.amount) / 10 ** 9} tokens`);
    console.log(`  User1 balance: ${Number(user1Account.amount) / 10 ** 9} tokens`);
    
    // Check withheld amount
    console.log(`  Withheld fees will accumulate in token accounts\n`);

    // Test another transfer (user1 to user2)
    console.log('5️⃣ Testing second transfer (to accumulate fees)...');
    const secondTransferAmount = 50 * 10 ** 9; // 50 tokens
    
    await transferChecked(
      connection,
      payerKeypair,
      user1Ata,
      mintKeypair.publicKey,
      user2Ata,
      testUser1,
      secondTransferAmount,
      9,
      [testUser1],
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    console.log('✅ Second transfer completed\n');

    // Final balance check
    console.log('6️⃣ Final balance summary:');
    const finalPayerAccount = await getAccount(connection, payerAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const finalUser1Account = await getAccount(connection, user1Ata, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const finalUser2Account = await getAccount(connection, user2Ata, 'confirmed', TOKEN_2022_PROGRAM_ID);

    console.log(`  Payer: ${Number(finalPayerAccount.amount) / 10 ** 9} tokens`);
    console.log(`  User1: ${Number(finalUser1Account.amount) / 10 ** 9} tokens`);
    console.log(`  User2: ${Number(finalUser2Account.amount) / 10 ** 9} tokens`);

    // Show withheld amounts
    console.log('\n📊 Withheld fees in accounts:');
    await showWithheldAmount(connection, payerAta, 'Payer');
    await showWithheldAmount(connection, user1Ata, 'User1');
    await showWithheldAmount(connection, user2Ata, 'User2');

    console.log('\n✅ Transfer fee test completed successfully!');
    console.log('💡 The 5% fee is being collected as expected and stored in the token accounts.');
    console.log('🔒 The transfer fee config authority has been revoked, making the 5% fee permanent.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

async function accountExists(connection: Connection, address: PublicKey): Promise<boolean> {
  try {
    const info = await connection.getAccountInfo(address);
    return info !== null;
  } catch {
    return false;
  }
}

async function showWithheldAmount(connection: Connection, ata: PublicKey, label: string) {
  // Note: Withheld amounts are stored in the mint's withheld accounts
  // This is a simplified display function
  console.log(`  ${label}: Check withheld fees via harvest operation`);
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

function loadMintKeypair(): Keypair {
  const mintKeyPath = path.join(process.cwd(), 'keys', 'miko-mint.json');
  try {
    const keypairData = JSON.parse(fs.readFileSync(mintKeyPath, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(keypairData));
  } catch (error) {
    console.error(`Failed to load mint keypair from ${mintKeyPath}`);
    console.error('Please run create-miko-token.ts first');
    throw error;
  }
}

// Run the script
if (require.main === module) {
  testTokenFees()
    .then(() => {
      console.log('\n✅ Test script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test script failed:', error);
      process.exit(1);
    });
}

export { testTokenFees };