const { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');

const dotenv = require('dotenv');
const fs = require('fs');

// Load test environment
dotenv.config({ path: '../.env.test' });

// Import the raw transfer fee instruction from buffer-layout
const BufferLayout = require('@solana/buffer-layout');
const { u8 } = BufferLayout;
const { u64 } = require('@solana/buffer-layout-utils');

// Manual instruction layout for transfer_checked_with_fee
const transferCheckedWithFeeLayout = BufferLayout.struct([
  u8('instruction'), // 12 for TransferCheckedWithFee
  u64('amount'),
  u8('decimals'),
  u64('fee'),
]);

function createTransferCheckedWithFeeInstructionManual(
  source,
  mint,
  destination,
  authority,
  amount,
  decimals,
  fee,
  programId
) {
  const data = Buffer.alloc(transferCheckedWithFeeLayout.span);
  transferCheckedWithFeeLayout.encode(
    {
      instruction: 12, // TransferCheckedWithFee instruction
      amount,
      decimals,
      fee,
    },
    data
  );

  const keys = [
    { pubkey: source, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: destination, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
  ];

  return {
    keys,
    programId,
    data,
  };
}

const { 
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} = require('@solana/spl-token');

async function testTransfers() {
  console.log('Testing Token-2022 transfers with manual instruction creation...');
  
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
  
  // Get token accounts
  const treasuryAta = await getAssociatedTokenAddress(
    mikoMint,
    treasuryKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  // Create test holder
  const testHolder = Keypair.generate();
  console.log('Test holder:', testHolder.publicKey.toBase58());
  
  // Get or create holder token account
  const holderAta = await getAssociatedTokenAddress(
    mikoMint,
    testHolder.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  try {
    // Create holder ATA
    const tx1 = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payerKeypair.publicKey,
        holderAta,
        testHolder.publicKey,
        mikoMint,
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    const sig1 = await sendAndConfirmTransaction(
      connection,
      tx1,
      [payerKeypair],
      { commitment: 'confirmed' }
    );
    console.log('Created holder ATA:', sig1);
    
    // Transfer 1000 MIKO with fee using manual instruction
    const amount = 1000 * Math.pow(10, DECIMALS);
    const feeAmount = Math.floor(amount * 0.05); // 5% fee
    
    const transferIx = createTransferCheckedWithFeeInstructionManual(
      treasuryAta,
      mikoMint,
      holderAta,
      treasuryKeypair.publicKey,
      amount,
      DECIMALS,
      feeAmount,
      TOKEN_2022_PROGRAM_ID
    );
    
    const tx2 = new Transaction().add(transferIx);
    
    const sig2 = await sendAndConfirmTransaction(
      connection,
      tx2,
      [treasuryKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log('Transfer successful:', sig2);
    console.log(`Transferred ${amount / Math.pow(10, DECIMALS)} MIKO with ${feeAmount / Math.pow(10, DECIMALS)} MIKO fee`);
    
    // Check balances
    const holderInfo = await getAccount(connection, holderAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('Holder received:', Number(holderInfo.amount) / Math.pow(10, DECIMALS), 'MIKO');
    
    // The fee should be withheld in the mint account
    console.log('\nFees are now withheld in the mint account.');
    console.log('Run the keeper bot to harvest and distribute these fees.');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testTransfers().catch(console.error);