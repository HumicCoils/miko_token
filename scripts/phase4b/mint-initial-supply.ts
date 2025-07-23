import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount
} from '@solana/spl-token';
import { readFileSync, writeFileSync } from 'fs';
import * as path from 'path';

const TOTAL_SUPPLY = 1_000_000_000_000_000_000; // 1 billion with 9 decimals

// ALL TOKENS TO DEPLOYER - NO FUCKING DISTRIBUTION
const DISTRIBUTION = {
  deployer: 1_000_000_000_000_000_000,  // 100% - ALL 1 billion MIKO to deployer ONLY
};

async function mintInitialSupply() {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  // Load ONLY deployer keypair - FUCK everyone else
  const deployerKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(path.join(__dirname, 'phase4b-deployer.json'), 'utf-8')))
  );
  
  // Load config
  const config = JSON.parse(readFileSync(path.join(__dirname, 'phase4b-config.json'), 'utf-8'));
  const tokenMint = new PublicKey(config.mikoToken);
  
  console.log('Minting ALL MIKO token supply TO DEPLOYER ONLY...');
  console.log('Token Mint:', tokenMint.toString());
  console.log('Total Supply:', TOTAL_SUPPLY / 1e9, 'MIKO');
  
  // Get ONLY deployer associated token address
  const deployerAta = getAssociatedTokenAddressSync(
    tokenMint,
    deployerKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  try {
    // Only create deployer ATA - FUCK everyone else
    try {
      await getAccount(connection, deployerAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
      console.log('Deployer ATA already exists');
    } catch {
      console.log('Creating deployer ATA...');
      const createAtaIx = createAssociatedTokenAccountInstruction(
        deployerKeypair.publicKey,
        deployerAta,
        deployerKeypair.publicKey,
        tokenMint,
        TOKEN_2022_PROGRAM_ID
      );
      
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new (await import('@solana/web3.js')).Transaction()
        .add(createAtaIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer = deployerKeypair.publicKey;
      tx.sign(deployerKeypair);
      
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      console.log('Deployer ATA created:', deployerAta.toString());
    }
    
    // Mint ALL tokens to DEPLOYER ONLY
    console.log('\nMinting ALL tokens to DEPLOYER...');
    
    const mintIx = createMintToInstruction(
      tokenMint,
      deployerAta,
      deployerKeypair.publicKey,
      TOTAL_SUPPLY,
      [],
      TOKEN_2022_PROGRAM_ID
    );
    
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new (await import('@solana/web3.js')).Transaction()
      .add(mintIx);
    tx.recentBlockhash = blockhash;
    tx.feePayer = deployerKeypair.publicKey;
    tx.sign(deployerKeypair);
    
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, 'confirmed');
    
    console.log(`Minted ${TOTAL_SUPPLY / 1e9} MIKO to DEPLOYER ONLY: ${sig}`);
    
    // Verify balance - ONLY DEPLOYER
    console.log('\nVerifying balance...');
    const deployerAccount = await getAccount(connection, deployerAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log(`Deployer balance: ${Number(deployerAccount.amount) / 1e9} MIKO`);
    console.log('ALL TOKENS ARE IN DEPLOYER WALLET - NO DISTRIBUTION!');
    
    // Save token account info - ONLY DEPLOYER
    const tokenAccounts = {
      deployer: deployerAta.toString(),
      totalSupply: TOTAL_SUPPLY,
      timestamp: new Date().toISOString()
    };
    
    writeFileSync(
      path.join(__dirname, 'token-accounts.json'),
      JSON.stringify(tokenAccounts, null, 2)
    );
    
    console.log('\nInitial token supply minted successfully!');
    console.log('Token account info saved to token-accounts.json');
    
  } catch (error) {
    console.error('Error minting initial supply:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  mintInitialSupply()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { mintInitialSupply };