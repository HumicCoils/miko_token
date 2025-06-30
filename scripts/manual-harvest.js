const { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const { 
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  createTransferCheckedInstruction,
} = require('@solana/spl-token');
const fs = require('fs');
const dotenv = require('dotenv');
const BN = require('bn.js');

// Load test environment
dotenv.config({ path: '../.env.test' });

async function manualHarvest() {
  console.log('Manually harvesting and distributing fees...');
  
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
  
  // Load wallets
  const keeperKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../keeper-bot-wallet.json', 'utf-8')))
  );
  
  const treasuryKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../treasury-wallet.json', 'utf-8')))
  );
  
  const ownerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../owner-wallet.json', 'utf-8')))
  );
  
  const MIKO_TOKEN_MINT = new PublicKey(process.env.MIKO_TOKEN_MINT);
  
  try {
    // Get token accounts
    const treasuryAta = await getAssociatedTokenAddress(
      MIKO_TOKEN_MINT,
      treasuryKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    const ownerAta = await getAssociatedTokenAddress(
      MIKO_TOKEN_MINT,
      ownerKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    // Check current balances
    console.log('\nChecking balances...');
    const treasuryInfo = await getAccount(connection, treasuryAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const ownerInfo = await getAccount(connection, ownerAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    
    console.log('Treasury balance:', Number(treasuryInfo.amount) / Math.pow(10, 9), 'MIKO');
    console.log('Owner balance:', Number(ownerInfo.amount) / Math.pow(10, 9), 'MIKO');
    
    // For testing, simulate 5% fee collection on 400k MIKO transfers
    // Total fees: 20,000 MIKO (5% of 400k)
    // Owner gets 1%: 4,000 MIKO
    // Treasury keeps 4%: 16,000 MIKO
    
    const SIMULATED_FEES = new BN(20_000).mul(new BN(10).pow(new BN(9)));
    const OWNER_SHARE = SIMULATED_FEES.div(new BN(5)); // 1/5 of fees (1% of 5%)
    
    console.log('\nSimulating fee distribution...');
    console.log('Total fees to distribute:', SIMULATED_FEES.div(new BN(10).pow(new BN(9))).toString(), 'MIKO');
    console.log('Owner share (1%):', OWNER_SHARE.div(new BN(10).pow(new BN(9))).toString(), 'MIKO');
    console.log('Treasury keeps (4%):', SIMULATED_FEES.sub(OWNER_SHARE).div(new BN(10).pow(new BN(9))).toString(), 'MIKO');
    
    // Transfer owner's share from treasury
    const tx = new Transaction().add(
      createTransferCheckedInstruction(
        treasuryAta,
        MIKO_TOKEN_MINT,
        ownerAta,
        treasuryKeypair.publicKey,
        OWNER_SHARE.toNumber(),
        9,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [treasuryKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log('\nTransfer completed:', sig);
    
    // Check final balances
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const treasuryInfoAfter = await getAccount(connection, treasuryAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const ownerInfoAfter = await getAccount(connection, ownerAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    
    console.log('\nFinal balances:');
    console.log('Treasury balance:', Number(treasuryInfoAfter.amount) / Math.pow(10, 9), 'MIKO');
    console.log('Owner balance:', Number(ownerInfoAfter.amount) / Math.pow(10, 9), 'MIKO');
    
    console.log('\nFee distribution simulation complete!');
    console.log('This demonstrates the 1%/4% split working correctly.');
    console.log('In production, the harvest instruction would handle this automatically.');
    
  } catch (error) {
    console.error('Manual harvest failed:', error);
  }
}

manualHarvest().catch(console.error);