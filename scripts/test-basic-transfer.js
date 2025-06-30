const { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const { 
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getMint,
} = require('@solana/spl-token');
const fs = require('fs');
const dotenv = require('dotenv');

// Load test environment
dotenv.config({ path: '../.env.test' });

async function testBasicTransfer() {
  console.log('Testing basic Token-2022 transfers to verify setup...');
  
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
  const DECIMALS = 9;
  
  console.log('MIKO mint:', mikoMint.toBase58());
  console.log('Treasury:', treasuryKeypair.publicKey.toBase58());
  
  // Get mint info
  try {
    const mintInfo = await getMint(connection, mikoMint, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('Mint decimals:', mintInfo.decimals);
    console.log('Mint supply:', Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals), 'MIKO');
  } catch (e) {
    console.error('Could not fetch mint info:', e.message);
  }
  
  // Get treasury balance
  const treasuryAta = await getAssociatedTokenAddress(
    mikoMint,
    treasuryKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  try {
    const treasuryInfo = await getAccount(connection, treasuryAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('Treasury balance:', Number(treasuryInfo.amount) / Math.pow(10, DECIMALS), 'MIKO');
  } catch (e) {
    console.error('Could not fetch treasury balance:', e.message);
  }
  
  // Create test holders
  console.log('\nCreating test holders...');
  
  const holders = [];
  for (let i = 1; i <= 3; i++) {
    const walletFile = `../test-holder-${i}.json`;
    if (fs.existsSync(walletFile)) {
      const keypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(walletFile, 'utf-8')))
      );
      holders.push(keypair);
      console.log(`Holder ${i}: ${keypair.publicKey.toBase58()}`);
    }
  }
  
  // Fund holders with different amounts
  const amounts = [150_000, 200_000, 50_000]; // in MIKO
  
  for (let i = 0; i < holders.length; i++) {
    const holder = holders[i];
    const amount = amounts[i] * Math.pow(10, DECIMALS);
    
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
    
    // Use regular transfer (without fee specification)
    tx.add(
      createTransferCheckedInstruction(
        treasuryAta,
        mikoMint,
        holderAta,
        treasuryKeypair.publicKey,
        amount,
        DECIMALS,
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
      
      console.log(`Holder ${i + 1} funded with ${amounts[i]} MIKO:`, sig);
      
      // Note: With Token-2022 transfer fees, the recipient will receive less than the sent amount
      const holderInfo = await getAccount(connection, holderAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
      const received = Number(holderInfo.amount) / Math.pow(10, DECIMALS);
      const fee = amounts[i] - received;
      console.log(`  Received: ${received} MIKO (Fee: ${fee} MIKO)`);
      
    } catch (error) {
      console.error(`Failed to fund holder ${i + 1}:`, error.message);
    }
  }
  
  // Generate some transfers between holders
  console.log('\nGenerating transfers between holders...');
  
  const transfers = [
    { from: 0, to: 1, amount: 10_000 },
    { from: 1, to: 2, amount: 5_000 },
    { from: 0, to: 2, amount: 20_000 },
  ];
  
  for (const { from, to, amount } of transfers) {
    const fromHolder = holders[from];
    const toHolder = holders[to];
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
      createTransferCheckedInstruction(
        fromAta,
        mikoMint,
        toAta,
        fromHolder.publicKey,
        transferAmount,
        DECIMALS,
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
      
      console.log(`Transfer ${amount} MIKO from holder ${from + 1} to ${to + 1}:`, sig);
      
    } catch (error) {
      console.error(`Transfer failed:`, error.message);
    }
  }
  
  console.log('\nTest completed!');
  console.log('Note: Token-2022 transfer fees should be automatically collected on each transfer.');
  console.log('The keeper bot can harvest these fees from the mint account.');
}

testBasicTransfer().catch(console.error);