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

const TOTAL_SUPPLY = 1_000_000_000_000_000_000; // 1 trillion with 9 decimals

// Distribution percentages
const DISTRIBUTION = {
  deployer: 500_000_000_000_000_000,  // 50% - 500 trillion MIKO
  treasury: 200_000_000_000_000_000,  // 20% - 200 trillion MIKO
  owner: 200_000_000_000_000_000,     // 20% - 200 trillion MIKO
  keeper: 100_000_000_000_000_000     // 10% - 100 trillion MIKO
};

async function mintInitialSupply() {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  // Load keypairs
  const deployerKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(path.join(__dirname, 'phase4b-deployer.json'), 'utf-8')))
  );
  
  const ownerKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(path.join(__dirname, 'phase4b-owner-keypair.json'), 'utf-8')))
  );
  
  const treasuryKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(path.join(__dirname, 'phase4b-treasury-keypair.json'), 'utf-8')))
  );
  
  const keeperKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(path.join(__dirname, 'phase4b-keeper-keypair.json'), 'utf-8')))
  );
  
  // Load config
  const config = JSON.parse(readFileSync(path.join(__dirname, 'phase4b-config.json'), 'utf-8'));
  const tokenMint = new PublicKey(config.mikoToken);
  
  console.log('Minting initial MIKO token supply...');
  console.log('Token Mint:', tokenMint.toString());
  console.log('Total Supply:', TOTAL_SUPPLY / 1e9, 'MIKO');
  
  // Get associated token addresses
  const deployerAta = getAssociatedTokenAddressSync(
    tokenMint,
    deployerKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  const treasuryAta = getAssociatedTokenAddressSync(
    tokenMint,
    treasuryKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  const ownerAta = getAssociatedTokenAddressSync(
    tokenMint,
    ownerKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  const keeperAta = getAssociatedTokenAddressSync(
    tokenMint,
    keeperKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  try {
    // Create ATAs if they don't exist
    const atas = [
      { ata: deployerAta, owner: deployerKeypair.publicKey, name: 'deployer' },
      { ata: treasuryAta, owner: treasuryKeypair.publicKey, name: 'treasury' },
      { ata: ownerAta, owner: ownerKeypair.publicKey, name: 'owner' },
      { ata: keeperAta, owner: keeperKeypair.publicKey, name: 'keeper' }
    ];
    
    for (const { ata, owner, name } of atas) {
      try {
        await getAccount(connection, ata, 'confirmed', TOKEN_2022_PROGRAM_ID);
        console.log(`${name} ATA already exists`);
      } catch {
        console.log(`Creating ${name} ATA...`);
        const createAtaIx = createAssociatedTokenAccountInstruction(
          deployerKeypair.publicKey,
          ata,
          owner,
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
        console.log(`${name} ATA created:`, ata.toString());
      }
    }
    
    // Mint tokens to each wallet
    console.log('\nMinting tokens to wallets...');
    
    for (const [wallet, amount] of Object.entries(DISTRIBUTION)) {
      let ata: PublicKey;
      switch (wallet) {
        case 'deployer':
          ata = deployerAta;
          break;
        case 'treasury':
          ata = treasuryAta;
          break;
        case 'owner':
          ata = ownerAta;
          break;
        case 'keeper':
          ata = keeperAta;
          break;
        default:
          continue;
      }
      
      const mintIx = createMintToInstruction(
        tokenMint,
        ata,
        deployerKeypair.publicKey,
        amount,
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
      
      console.log(`Minted ${amount / 1e9} MIKO to ${wallet}: ${sig}`);
    }
    
    // Verify balances
    console.log('\nVerifying balances...');
    for (const { ata, name } of atas) {
      const account = await getAccount(connection, ata, 'confirmed', TOKEN_2022_PROGRAM_ID);
      console.log(`${name} balance: ${Number(account.amount) / 1e9} MIKO`);
    }
    
    // Save token account info
    const tokenAccounts = {
      deployer: deployerAta.toString(),
      treasury: treasuryAta.toString(),
      owner: ownerAta.toString(),
      keeper: keeperAta.toString(),
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