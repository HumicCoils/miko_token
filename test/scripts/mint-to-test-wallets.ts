import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import * as fs from 'fs';

async function mintToTestWallets() {
  console.log('[TEST MODE] Minting MIKO tokens to test wallets...');
  
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load payer wallet (mint authority)
  const payerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('./test-wallet.json', 'utf-8')))
  );
  
  // Load token info
  const tokenInfo = JSON.parse(fs.readFileSync('./test-token-info.json', 'utf-8'));
  const mintPubkey = new PublicKey(tokenInfo.mint);
  
  console.log('Token mint:', mintPubkey.toBase58());
  console.log('Mint authority:', payerKeypair.publicKey.toBase58());
  
  // Test wallet configurations
  const testWallets = [
    {
      name: 'test-holder-1',
      amount: 150_000_000_000_000n, // 150,000 MIKO (above threshold)
    },
    {
      name: 'test-holder-2',
      amount: 200_000_000_000_000n, // 200,000 MIKO (above threshold)
    },
    {
      name: 'test-holder-3',
      amount: 50_000_000_000_000n,  // 50,000 MIKO (below threshold)
    },
  ];
  
  for (const wallet of testWallets) {
    try {
      // Generate or load wallet
      let recipientKeypair: Keypair;
      const walletFile = `./${wallet.name}.json`;
      
      if (fs.existsSync(walletFile)) {
        recipientKeypair = Keypair.fromSecretKey(
          Uint8Array.from(JSON.parse(fs.readFileSync(walletFile, 'utf-8')))
        );
        console.log(`\nLoaded ${wallet.name}:`, recipientKeypair.publicKey.toBase58());
      } else {
        recipientKeypair = Keypair.generate();
        fs.writeFileSync(walletFile, JSON.stringify(Array.from(recipientKeypair.secretKey)));
        console.log(`\nCreated ${wallet.name}:`, recipientKeypair.publicKey.toBase58());
      }
      
      // Get associated token address
      const recipientAta = await getAssociatedTokenAddress(
        mintPubkey,
        recipientKeypair.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      // Check if ATA exists
      const ataInfo = await connection.getAccountInfo(recipientAta);
      const instructions = [];
      
      if (!ataInfo) {
        // Create ATA
        instructions.push(
          createAssociatedTokenAccountInstruction(
            payerKeypair.publicKey,
            recipientAta,
            recipientKeypair.publicKey,
            mintPubkey,
            TOKEN_2022_PROGRAM_ID
          )
        );
      }
      
      // Mint tokens
      instructions.push(
        createMintToInstruction(
          mintPubkey,
          recipientAta,
          payerKeypair.publicKey,
          wallet.amount,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );
      
      const transaction = new Transaction().add(...instructions);
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payerKeypair]
      );
      
      console.log(`Minted ${Number(wallet.amount) / 1e9} MIKO`);
      console.log(`Transaction: ${signature}`);
      
      // Check balance
      const balance = await connection.getTokenAccountBalance(recipientAta);
      console.log(`Balance: ${balance.value.uiAmount} MIKO`);
      
    } catch (error) {
      console.error(`Failed to mint to ${wallet.name}:`, error);
    }
  }
  
  console.log('\n[TEST MODE] Minting complete!');
  console.log('[TEST MODE] Wallets above 100k MIKO threshold:', ['test-holder-1', 'test-holder-2']);
  console.log('[TEST MODE] Wallets below threshold:', ['test-holder-3']);
}

mintToTestWallets().catch(console.error);