import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import * as fs from 'fs';

async function generateTestTransactions() {
  console.log('[TEST MODE] Generating test transactions to accumulate fees...');
  
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load token info
  const tokenInfo = JSON.parse(fs.readFileSync('./test-token-info.json', 'utf-8'));
  const mintPubkey = new PublicKey(tokenInfo.mint);
  
  console.log('Token mint:', mintPubkey.toBase58());
  console.log('Transfer fee: 5%');
  
  // Load test wallets
  const testWallets = [
    {
      name: 'test-holder-1',
      keypair: Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync('./test-holder-1.json', 'utf-8')))
      ),
    },
    {
      name: 'test-holder-2',
      keypair: Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync('./test-holder-2.json', 'utf-8')))
      ),
    },
  ];
  
  console.log('\nGenerating transfers between test wallets...');
  
  // Generate 10 test transactions
  for (let i = 0; i < 10; i++) {
    try {
      // Alternate between wallets
      const sender = testWallets[i % 2];
      const receiver = testWallets[(i + 1) % 2];
      
      console.log(`\nTransaction ${i + 1}: ${sender.name} -> ${receiver.name}`);
      
      // Get ATAs
      const senderAta = await getAssociatedTokenAddress(
        mintPubkey,
        sender.keypair.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      const receiverAta = await getAssociatedTokenAddress(
        mintPubkey,
        receiver.keypair.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      // Transfer 1,000 MIKO (will generate 50 MIKO in fees)
      const amount = 1_000_000_000_000n; // 1,000 MIKO with 9 decimals
      
      const transferIx = createTransferInstruction(
        senderAta,
        receiverAta,
        sender.keypair.publicKey,
        amount,
        [],
        TOKEN_2022_PROGRAM_ID
      );
      
      const transaction = new Transaction().add(transferIx);
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [sender.keypair]
      );
      
      console.log(`Transferred 1,000 MIKO (50 MIKO fee withheld)`);
      console.log(`Transaction: ${signature}`);
      
      // Wait a bit between transactions
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`Transaction ${i + 1} failed:`, error);
    }
  }
  
  console.log('\n[TEST MODE] Test transactions complete!');
  console.log('[TEST MODE] Total fees generated: ~500 MIKO (50 MIKO per transaction)');
  console.log('[TEST MODE] These fees are now withheld in token accounts');
  console.log('[TEST MODE] Run the keeper bot to harvest and distribute them');
}

generateTestTransactions().catch(console.error);