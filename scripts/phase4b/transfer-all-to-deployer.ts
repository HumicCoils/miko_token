import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAccount
} from '@solana/spl-token';
import { readFileSync } from 'fs';
import * as path from 'path';

async function transferAllToDeployer() {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  // Load keypairs
  const treasuryKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(path.join(__dirname, 'phase4b-treasury-keypair.json'), 'utf-8')))
  );
  
  const ownerKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(path.join(__dirname, 'phase4b-owner-keypair.json'), 'utf-8')))
  );
  
  const keeperKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(path.join(__dirname, 'phase4b-keeper-keypair.json'), 'utf-8')))
  );
  
  // Load config and token accounts
  const config = JSON.parse(readFileSync(path.join(__dirname, 'phase4b-config.json'), 'utf-8'));
  const tokenAccounts = JSON.parse(readFileSync(path.join(__dirname, 'token-accounts.json'), 'utf-8'));
  
  const tokenMint = new PublicKey(config.mikoToken);
  const deployerAta = new PublicKey(tokenAccounts.deployer);
  const treasuryAta = new PublicKey(tokenAccounts.treasury);
  const ownerAta = new PublicKey(tokenAccounts.owner);
  const keeperAta = new PublicKey(tokenAccounts.keeper);
  
  console.log('Transferring all tokens to deployer...');
  
  try {
    // Check balances
    const treasuryAccount = await getAccount(connection, treasuryAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const ownerAccount = await getAccount(connection, ownerAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const keeperAccount = await getAccount(connection, keeperAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    
    console.log('\nCurrent balances:');
    console.log(`- Treasury: ${Number(treasuryAccount.amount) / 1e9} MIKO`);
    console.log(`- Owner: ${Number(ownerAccount.amount) / 1e9} MIKO`);
    console.log(`- Keeper: ${Number(keeperAccount.amount) / 1e9} MIKO`);
    
    // Transfer from treasury
    if (treasuryAccount.amount > 0n) {
      console.log('\nTransferring from treasury...');
      const treasuryTransferIx = createTransferCheckedInstruction(
        treasuryAta,
        tokenMint,
        deployerAta,
        treasuryKeypair.publicKey,
        Number(treasuryAccount.amount),
        9,
        [],
        TOKEN_2022_PROGRAM_ID
      );
      
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction().add(treasuryTransferIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer = treasuryKeypair.publicKey;
      tx.sign(treasuryKeypair);
      
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      console.log('Treasury transfer complete:', sig);
    }
    
    // Transfer from owner
    if (ownerAccount.amount > 0n) {
      console.log('\nTransferring from owner...');
      const ownerTransferIx = createTransferCheckedInstruction(
        ownerAta,
        tokenMint,
        deployerAta,
        ownerKeypair.publicKey,
        Number(ownerAccount.amount),
        9,
        [],
        TOKEN_2022_PROGRAM_ID
      );
      
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction().add(ownerTransferIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer = ownerKeypair.publicKey;
      tx.sign(ownerKeypair);
      
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      console.log('Owner transfer complete:', sig);
    }
    
    // Transfer from keeper
    if (keeperAccount.amount > 0n) {
      console.log('\nTransferring from keeper...');
      const keeperTransferIx = createTransferCheckedInstruction(
        keeperAta,
        tokenMint,
        deployerAta,
        keeperKeypair.publicKey,
        Number(keeperAccount.amount),
        9,
        [],
        TOKEN_2022_PROGRAM_ID
      );
      
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction().add(keeperTransferIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer = keeperKeypair.publicKey;
      tx.sign(keeperKeypair);
      
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      console.log('Keeper transfer complete:', sig);
    }
    
    // Check final deployer balance
    const finalDeployerAccount = await getAccount(connection, deployerAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log(`\n✅ Deployer now has: ${Number(finalDeployerAccount.amount) / 1e9} MIKO`);
    
  } catch (error) {
    console.error('Error transferring tokens:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  transferAllToDeployer()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { transferAllToDeployer };