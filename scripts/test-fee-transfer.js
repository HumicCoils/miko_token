const { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const { 
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedWithFeeInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} = require('@solana/spl-token');
const fs = require('fs');
const dotenv = require('dotenv');
const BN = require('bn.js');

// Load test environment
dotenv.config({ path: '../.env.test' });

async function testFeeTransfer() {
  console.log('Testing Token-2022 transfer with fees...');
  
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
  
  // Load wallets
  const payerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../keeper-bot-wallet.json', 'utf-8')))
  );
  
  const treasuryKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../treasury-wallet.json', 'utf-8')))
  );
  
  const ownerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../owner-wallet.json', 'utf-8')))
  );
  
  const mikoMint = new PublicKey(process.env.MIKO_TOKEN_MINT);
  const DECIMALS = 9;
  
  // Get token accounts
  const treasuryAta = await getAssociatedTokenAddress(
    mikoMint,
    treasuryKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  const ownerAta = await getAssociatedTokenAddress(
    mikoMint,
    ownerKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  // Create test holders if they don't exist
  const testHolders = [];
  for (let i = 1; i <= 3; i++) {
    const walletFile = `../test-holder-${i}.json`;
    const keypair = fs.existsSync(walletFile) 
      ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletFile, 'utf-8'))))
      : (() => {
          const kp = Keypair.generate();
          fs.writeFileSync(walletFile, JSON.stringify(Array.from(kp.secretKey)));
          return kp;
        })();
    testHolders.push(keypair);
  }
  
  console.log('Test holders:');
  testHolders.forEach((h, i) => console.log(`  Holder ${i + 1}: ${h.publicKey.toBase58()}`));
  
  // Fund test holders with proper amounts using BN
  const amounts = [
    new BN(150_000).mul(new BN(10).pow(new BN(DECIMALS))), // 150k MIKO
    new BN(200_000).mul(new BN(10).pow(new BN(DECIMALS))), // 200k MIKO  
    new BN(50_000).mul(new BN(10).pow(new BN(DECIMALS))),  // 50k MIKO
  ];
  
  console.log('\nFunding test holders...');
  
  for (let i = 0; i < testHolders.length; i++) {
    const holder = testHolders[i];
    const amount = amounts[i];
    
    // Get or create holder token account
    const holderAta = await getAssociatedTokenAddress(
      mikoMint,
      holder.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    const tx = new Transaction();
    
    // Check if ATA exists
    try {
      await getAccount(connection, holderAta, undefined, TOKEN_2022_PROGRAM_ID);
    } catch {
      // Create ATA
      tx.add(
        createAssociatedTokenAccountInstruction(
          payerKeypair.publicKey,
          holderAta,
          holder.publicKey,
          mikoMint,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }
    
    // Transfer with fee - pass amount as number for spl-token 0.3.9
    tx.add(
      createTransferCheckedWithFeeInstruction(
        treasuryAta,
        mikoMint,
        holderAta,
        treasuryKeypair.publicKey,
        amount.toNumber(), // spl-token 0.3.9 expects number
        DECIMALS,
        500, // 5% fee basis points
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    try {
      const sig = await sendAndConfirmTransaction(
        connection,
        tx,
        [payerKeypair, treasuryKeypair],
        { commitment: 'confirmed' }
      );
      
      console.log(`Holder ${i + 1} funded with ${amount.div(new BN(10).pow(new BN(DECIMALS))).toString()} MIKO:`, sig);
    } catch (error) {
      console.error(`Failed to fund holder ${i + 1}:`, error.message);
    }
  }
  
  // Generate test transactions
  console.log('\nGenerating transfers between holders...');
  
  const testTransfers = [
    { from: 0, to: 1, amount: new BN(10_000).mul(new BN(10).pow(new BN(DECIMALS))) },
    { from: 1, to: 2, amount: new BN(5_000).mul(new BN(10).pow(new BN(DECIMALS))) },
    { from: 0, to: 2, amount: new BN(20_000).mul(new BN(10).pow(new BN(DECIMALS))) },
  ];
  
  for (const { from, to, amount } of testTransfers) {
    const fromHolder = testHolders[from];
    const toHolder = testHolders[to];
    
    const fromAta = await getAssociatedTokenAddress(
      mikoMint,
      fromHolder.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    const toAta = await getAssociatedTokenAddress(
      mikoMint,
      toHolder.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    const tx = new Transaction().add(
      createTransferCheckedWithFeeInstruction(
        fromAta,
        mikoMint,
        toAta,
        fromHolder.publicKey,
        amount.toNumber(),
        DECIMALS,
        500,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    try {
      const sig = await sendAndConfirmTransaction(
        connection,
        tx,
        [fromHolder],
        { commitment: 'confirmed' }
      );
      
      const transferAmount = amount.div(new BN(10).pow(new BN(DECIMALS))).toString();
      const feeAmount = amount.mul(new BN(5)).div(new BN(100)).div(new BN(10).pow(new BN(DECIMALS))).toString();
      console.log(`Transfer ${transferAmount} MIKO from holder ${from + 1} to ${to + 1} (fee: ${feeAmount} MIKO):`, sig);
    } catch (error) {
      console.error(`Transfer failed:`, error.message);
    }
  }
  
  console.log('\nTest completed!');
  console.log('Fees should now be accumulated in the token mint.');
  console.log('Run the keeper bot to harvest and distribute these fees.');
}

testFeeTransfer().catch(console.error);