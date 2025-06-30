const { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} = require('@solana/web3.js');
const { 
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedWithFeeInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getMint,
} = require('@solana/spl-token');
const fs = require('fs');
const dotenv = require('dotenv');

// Load test environment
dotenv.config({ path: '../.env.test' });

async function generateTestTransactions() {
  console.log('Generating test transactions to create transfer fees...');
  
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
  
  const mikoMint = new PublicKey(process.env.MIKO_TOKEN_MINT);
  console.log('MIKO token mint:', mikoMint.toBase58());
  
  // Create test holder wallets
  const testHolders = [];
  for (let i = 1; i <= 3; i++) {
    let keypair;
    const walletFile = `../test-holder-${i}.json`;
    
    if (fs.existsSync(walletFile)) {
      // Load existing wallet
      keypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(walletFile, 'utf-8')))
      );
      console.log(`Loaded test holder ${i}:`, keypair.publicKey.toBase58());
    } else {
      // Generate new wallet
      keypair = Keypair.generate();
      fs.writeFileSync(walletFile, JSON.stringify(Array.from(keypair.secretKey)));
      console.log(`Created test holder ${i}:`, keypair.publicKey.toBase58());
      
      // Airdrop SOL for transaction fees
      try {
        await connection.requestAirdrop(keypair.publicKey, 0.1 * LAMPORTS_PER_SOL);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
        console.log(`Airdrop failed for holder ${i}, continuing...`);
      }
    }
    
    testHolders.push(keypair);
  }
  
  // Get treasury token account
  const treasuryAta = await getAssociatedTokenAddress(
    mikoMint,
    treasuryKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  console.log('\nDistributing MIKO tokens to test holders...');
  
  // Distribute tokens to test holders
  const DECIMALS = 9;
  const amounts = [
    150_000 * Math.pow(10, DECIMALS), // Holder 1: 150k MIKO (eligible)
    200_000 * Math.pow(10, DECIMALS), // Holder 2: 200k MIKO (eligible)
    50_000 * Math.pow(10, DECIMALS),  // Holder 3: 50k MIKO (not eligible)
  ];
  
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
      // Create ATA if it doesn't exist
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
    
    // Transfer tokens with fee
    tx.add(
      createTransferCheckedWithFeeInstruction(
        treasuryAta,
        mikoMint,
        holderAta,
        treasuryKeypair.publicKey,
        amount,
        DECIMALS,
        500, // 5% fee basis points
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [payerKeypair, treasuryKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log(`Holder ${i + 1} funded with ${amounts[i] / Math.pow(10, DECIMALS)} MIKO:`, sig);
  }
  
  console.log('\nGenerating test transactions between holders...');
  
  // Generate transactions between holders to create fees
  const testTransactions = [
    { from: 0, to: 1, amount: 10_000 }, // 10k MIKO transfer
    { from: 1, to: 2, amount: 5_000 },   // 5k MIKO transfer
    { from: 0, to: 2, amount: 20_000 }, // 20k MIKO transfer
    { from: 1, to: 0, amount: 15_000 }, // 15k MIKO transfer
  ];
  
  for (const { from, to, amount } of testTransactions) {
    const fromHolder = testHolders[from];
    const toHolder = testHolders[to];
    const transferAmount = amount * Math.pow(10, DECIMALS);
    
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
        transferAmount,
        DECIMALS,
        500, // 5% fee basis points
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [fromHolder],
      { commitment: 'confirmed' }
    );
    
    const feeAmount = (transferAmount * 0.05) / Math.pow(10, DECIMALS);
    console.log(`Transfer ${amount} MIKO from holder ${from + 1} to ${to + 1} (fee: ${feeAmount} MIKO):`, sig);
  }
  
  console.log('\nTest transactions completed!');
  console.log('\nSummary:');
  console.log('- Created 3 test holder wallets');
  console.log('- Holder 1: 150k MIKO (eligible for rewards)');
  console.log('- Holder 2: 200k MIKO (eligible for rewards)');
  console.log('- Holder 3: 50k MIKO (NOT eligible - below 100k threshold)');
  console.log('- Generated 4 test transactions with 5% fees');
  console.log('- Total fees generated: ~2,500 MIKO');
  
  console.log('\nNext steps:');
  console.log('1. Wait 5 minutes for keeper bot to harvest fees');
  console.log('2. Check that 1% goes to owner wallet');
  console.log('3. Check that 4% is distributed to eligible holders');
}

generateTestTransactions().catch(console.error);