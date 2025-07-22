import { Connection, PublicKey, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID, 
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  getTransferFeeConfig
} from '@solana/spl-token';
import * as fs from 'fs';

const RPC_URL = 'https://api.devnet.solana.com';

async function main() {
  try {
    console.log('🔍 VC:3.TRANSFER_TEST - Testing Standard Token Transfer with 30% Fee...\n');
    console.log('Using STANDARD SPL Token transfer - exactly as wallets/DEXs would use\n');

    const connection = new Connection(RPC_URL, 'confirmed');

    // Load token info
    const tokenInfoPath = '/shared-artifacts/token-info.json';
    const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf-8'));
    const mintPubkey = new PublicKey(tokenInfo.mint);
    console.log('✅ Token Mint:', mintPubkey.toBase58());

    // Load deployer keypair (has tokens)
    const deployerPath = '/shared-artifacts/deployer-keypair.json';
    const deployerRaw = fs.readFileSync(deployerPath, 'utf-8');
    const deployerKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(deployerRaw)));
    console.log('✅ Source Wallet:', deployerKeypair.publicKey.toBase58());

    // Create test receiver wallet
    const receiverKeypair = Keypair.generate();
    console.log('✅ Receiver Wallet:', receiverKeypair.publicKey.toBase58());

    // Get mint info to verify fee config
    console.log('\n📊 Fetching mint info...');
    const mintInfo = await getMint(connection, mintPubkey, undefined, TOKEN_2022_PROGRAM_ID);
    const transferFeeConfig = getTransferFeeConfig(mintInfo);
    
    if (!transferFeeConfig) {
      throw new Error('Transfer fee config not found on mint');
    }

    console.log('✅ Transfer Fee:', transferFeeConfig.newerTransferFee.transferFeeBasisPoints, 'basis points (', 
                transferFeeConfig.newerTransferFee.transferFeeBasisPoints / 100, '%)');

    // Get or create associated token accounts
    console.log('\n📋 Setting up token accounts...');
    const sourceATA = await getAssociatedTokenAddress(
      mintPubkey,
      deployerKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    console.log('  - Source ATA:', sourceATA.toBase58());

    const receiverATA = await getAssociatedTokenAddress(
      mintPubkey,
      receiverKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    console.log('  - Receiver ATA:', receiverATA.toBase58());

    // Check if receiver ATA exists, if not create it
    const receiverATAInfo = await connection.getAccountInfo(receiverATA);
    const instructions = [];

    if (!receiverATAInfo) {
      console.log('  - Creating receiver ATA...');
      instructions.push(
        createAssociatedTokenAccountInstruction(
          deployerKeypair.publicKey, // payer
          receiverATA,
          receiverKeypair.publicKey, // owner
          mintPubkey,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    // Get source account balance before
    const sourceAccountBefore = await getAccount(connection, sourceATA, undefined, TOKEN_2022_PROGRAM_ID);
    console.log('\n📊 Source Balance Before:', sourceAccountBefore.amount.toString());

    // Transfer amount: 100 MIKO (with 9 decimals)
    const transferAmount = BigInt(100 * Math.pow(10, 9));
    console.log('\n🔄 Transfer Details:');
    console.log('  - Amount to send:', transferAmount.toString(), '(100 MIKO)');
    console.log('  - Expected fee (30%):', (transferAmount * BigInt(30) / BigInt(100)).toString());
    console.log('  - Expected received:', (transferAmount * BigInt(70) / BigInt(100)).toString());

    // Create standard transfer instruction - EXACTLY as wallets would do
    console.log('\n📝 Creating STANDARD transfer instruction...');
    const transferInstruction = createTransferCheckedInstruction(
      sourceATA,
      mintPubkey,
      receiverATA,
      deployerKeypair.publicKey,
      transferAmount,
      9, // decimals
      [],
      TOKEN_2022_PROGRAM_ID
    );
    instructions.push(transferInstruction);

    // Send transaction
    const tx = new Transaction().add(...instructions);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = deployerKeypair.publicKey;

    console.log('\n🚀 Sending transaction (standard SPL token transfer)...');
    const signature = await connection.sendTransaction(tx, [deployerKeypair]);
    console.log('📝 Transaction signature:', signature);

    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Transaction confirmed!');

    // Verify results
    console.log('\n🔍 Verifying transfer results...');
    
    // Get account balances after
    const sourceAccountAfter = await getAccount(connection, sourceATA, undefined, TOKEN_2022_PROGRAM_ID);
    const receiverAccount = await getAccount(connection, receiverATA, undefined, TOKEN_2022_PROGRAM_ID);
    
    const actualSent = BigInt(sourceAccountBefore.amount) - BigInt(sourceAccountAfter.amount);
    const actualReceived = BigInt(receiverAccount.amount);
    const actualFee = actualSent - actualReceived;
    const expectedFee = transferAmount * BigInt(30) / BigInt(100);
    const expectedReceived = transferAmount * BigInt(70) / BigInt(100);

    console.log('\n📊 Transfer Results:');
    console.log('  - Amount sent from source:', actualSent.toString());
    console.log('  - Amount received:', actualReceived.toString());
    console.log('  - Fee collected:', actualFee.toString());
    console.log('  - Expected received:', expectedReceived.toString());
    console.log('  - Expected fee:', expectedFee.toString());

    // Check if fee was applied correctly
    const feeCorrect = actualFee === expectedFee;
    const receivedCorrect = actualReceived === expectedReceived;
    const testPassed = feeCorrect && receivedCorrect && actualSent === transferAmount;

    console.log('\n🔍 Verification:');
    console.log('  - Sent amount correct:', actualSent === transferAmount ? 'Yes ✅' : 'No ❌');
    console.log('  - Received amount correct:', receivedCorrect ? 'Yes ✅' : 'No ❌');
    console.log('  - Fee amount correct:', feeCorrect ? 'Yes ✅' : 'No ❌');
    console.log('  - 30% fee applied:', feeCorrect ? 'Yes ✅' : 'No ❌');

    // Check withheld amount on mint
    const mintInfoAfter = await getMint(connection, mintPubkey, undefined, TOKEN_2022_PROGRAM_ID);
    const transferFeeConfigAfter = getTransferFeeConfig(mintInfoAfter);
    console.log('\n📊 Withheld Fees on Mint:');
    console.log('  - Total withheld:', transferFeeConfigAfter?.withheldAmount.toString());

    // Save verification result
    const verificationResult = {
      vcName: "VC:3.TRANSFER_TEST",
      timestamp: new Date().toISOString(),
      mint: mintPubkey.toBase58(),
      transferDetails: {
        source: deployerKeypair.publicKey.toBase58(),
        receiver: receiverKeypair.publicKey.toBase58(),
        amountSent: actualSent.toString(),
        amountReceived: actualReceived.toString(),
        feeCollected: actualFee.toString(),
        transactionSignature: signature
      },
      expectedValues: {
        amountToSend: transferAmount.toString(),
        expectedReceived: expectedReceived.toString(),
        expectedFee: expectedFee.toString(),
        feePercentage: "30%"
      },
      verification: {
        sentAmountCorrect: actualSent === transferAmount,
        receivedAmountCorrect: receivedCorrect,
        feeAmountCorrect: feeCorrect,
        standardTransferUsed: true,
        message: "Used standard createTransferCheckedInstruction as wallets/DEXs would"
      },
      withheldFeesOnMint: transferFeeConfigAfter?.withheldAmount.toString(),
      passed: testPassed
    };

    const verificationPath = '/shared-artifacts/verification/vc3-transfer-test.json';
    fs.mkdirSync('/shared-artifacts/verification', { recursive: true });
    fs.writeFileSync(verificationPath, JSON.stringify(verificationResult, null, 2));
    
    console.log('\n✅ Verification result saved to:', verificationPath);
    
    if (testPassed) {
      console.log('\n✅ VC:3.TRANSFER_TEST PASSED!');
      console.log('Standard token transfers work correctly with 30% fee.');
      console.log('Token is compatible with all wallets and DEXs.');
    } else {
      console.log('\n❌ VC:3.TRANSFER_TEST FAILED!');
      console.log('Transfer did not work as expected. Check the details above.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    
    // Save failed verification
    const failedResult = {
      vcName: "VC:3.TRANSFER_TEST",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      passed: false
    };
    
    const verificationPath = '/shared-artifacts/verification/vc3-transfer-test.json';
    fs.mkdirSync('/shared-artifacts/verification', { recursive: true });
    fs.writeFileSync(verificationPath, JSON.stringify(failedResult, null, 2));
    
    process.exit(1);
  }
}

main();