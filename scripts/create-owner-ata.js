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
  createAssociatedTokenAccountInstruction,
} = require('@solana/spl-token');
const fs = require('fs');
const dotenv = require('dotenv');

// Load test environment
dotenv.config({ path: '../.env.test' });

async function createOwnerATA() {
  console.log('Creating owner token account...');
  
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
  
  // Load wallets
  const payerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../keeper-bot-wallet.json', 'utf-8')))
  );
  
  const ownerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../owner-wallet.json', 'utf-8')))
  );
  
  const mikoMint = new PublicKey(process.env.MIKO_TOKEN_MINT);
  
  console.log('Owner wallet:', ownerKeypair.publicKey.toBase58());
  console.log('MIKO mint:', mikoMint.toBase58());
  
  try {
    const ownerAta = await getAssociatedTokenAddress(
      mikoMint,
      ownerKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log('Owner ATA address:', ownerAta.toBase58());
    
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payerKeypair.publicKey,
        ownerAta,
        ownerKeypair.publicKey,
        mikoMint,
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [payerKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log('Owner token account created:', sig);
    
  } catch (error) {
    console.error('Failed:', error);
  }
}

createOwnerATA().catch(console.error);