const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// Constants
const VAULT_PROGRAM_ID = new PublicKey('DHzZjjPoRmbYvTsXE3Je1JW2M4qgkKsqsuTz3uKHh4qJ');
const MIKO_TOKEN_MINT = new PublicKey('H5KVrB48CTUVsQhYRULzEEZ5LCLxjJWCX7dHeLW4FVEw');

async function initializeVault() {
  try {
    console.log('Loading wallets...');
    
    // Load or create wallets
    let ownerKeypair, keeperKeypair, treasuryKeypair;
    
    // Owner wallet
    const ownerPath = path.join(__dirname, '../owner-wallet.json');
    if (fs.existsSync(ownerPath)) {
      const ownerData = JSON.parse(fs.readFileSync(ownerPath, 'utf-8'));
      ownerKeypair = Keypair.fromSecretKey(Uint8Array.from(ownerData));
      console.log('Owner wallet loaded:', ownerKeypair.publicKey.toBase58());
    } else {
      ownerKeypair = Keypair.generate();
      fs.writeFileSync(ownerPath, JSON.stringify(Array.from(ownerKeypair.secretKey)));
      console.log('Owner wallet created:', ownerKeypair.publicKey.toBase58());
    }
    
    // Keeper wallet
    const keeperPath = path.join(__dirname, '../keeper-bot-wallet.json');
    if (fs.existsSync(keeperPath)) {
      const keeperData = JSON.parse(fs.readFileSync(keeperPath, 'utf-8'));
      keeperKeypair = Keypair.fromSecretKey(Uint8Array.from(keeperData));
      console.log('Keeper wallet loaded:', keeperKeypair.publicKey.toBase58());
    } else {
      keeperKeypair = Keypair.generate();
      fs.writeFileSync(keeperPath, JSON.stringify(Array.from(keeperKeypair.secretKey)));
      console.log('Keeper wallet created:', keeperKeypair.publicKey.toBase58());
    }
    
    // Treasury wallet
    const treasuryPath = path.join(__dirname, '../treasury-wallet.json');
    if (fs.existsSync(treasuryPath)) {
      const treasuryData = JSON.parse(fs.readFileSync(treasuryPath, 'utf-8'));
      treasuryKeypair = Keypair.fromSecretKey(Uint8Array.from(treasuryData));
      console.log('Treasury wallet loaded:', treasuryKeypair.publicKey.toBase58());
    } else {
      treasuryKeypair = Keypair.generate();
      fs.writeFileSync(treasuryPath, JSON.stringify(Array.from(treasuryKeypair.secretKey)));
      console.log('Treasury wallet created:', treasuryKeypair.publicKey.toBase58());
    }
    
    // Connect to devnet
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Check balance and airdrop if needed
    console.log('\nChecking wallet balances...');
    const ownerBalance = await connection.getBalance(ownerKeypair.publicKey);
    console.log('Owner balance:', ownerBalance / 1e9, 'SOL');
    
    if (ownerBalance < 1e9) { // Less than 1 SOL
      console.log('Requesting airdrop...');
      const sig = await connection.requestAirdrop(ownerKeypair.publicKey, 2e9); // 2 SOL
      await connection.confirmTransaction(sig);
      console.log('Airdrop complete');
    }
    
    // Derive vault PDA
    const [vaultPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault')],
      VAULT_PROGRAM_ID
    );
    
    console.log('\nVault Configuration:');
    console.log('Vault PDA:', vaultPda.toBase58());
    console.log('Program ID:', VAULT_PROGRAM_ID.toBase58());
    console.log('Token Mint:', MIKO_TOKEN_MINT.toBase58());
    console.log('Authority:', ownerKeypair.publicKey.toBase58());
    console.log('Treasury:', treasuryKeypair.publicKey.toBase58());
    console.log('Keeper:', keeperKeypair.publicKey.toBase58());
    
    // Check if vault already exists
    const vaultAccount = await connection.getAccountInfo(vaultPda);
    if (vaultAccount && vaultAccount.owner.equals(VAULT_PROGRAM_ID)) {
      console.log('\n⚠️  Vault is already initialized!');
      console.log('Account owner:', vaultAccount.owner.toBase58());
      console.log('Account size:', vaultAccount.data.length, 'bytes');
      return;
    }
    
    console.log('\n🚀 Initializing vault...');
    
    // Create initialize instruction
    // The discriminator for "initialize" is the first 8 bytes of sha256("global:initialize")
    const discriminator = Buffer.from([0xaf, 0xaf, 0x6d, 0x1f, 0x0d, 0x98, 0x9b, 0xed]);
    
    const accounts = [
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: ownerKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: MIKO_TOKEN_MINT, isSigner: false, isWritable: false },
      { pubkey: ownerKeypair.publicKey, isSigner: false, isWritable: false }, // owner
      { pubkey: treasuryKeypair.publicKey, isSigner: false, isWritable: false }, // treasury
      { pubkey: keeperKeypair.publicKey, isSigner: false, isWritable: false }, // keeper
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
    
    const instruction = new TransactionInstruction({
      programId: VAULT_PROGRAM_ID,
      keys: accounts,
      data: discriminator,
    });
    
    const transaction = new Transaction().add(instruction);
    
    // Send transaction
    const signature = await connection.sendTransaction(transaction, [ownerKeypair], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    
    console.log('Transaction sent:', signature);
    
    // Wait for confirmation
    await connection.confirmTransaction(signature, 'confirmed');
    
    console.log('\n✅ Vault initialized successfully!');
    
    // Verify vault was created
    const newVaultAccount = await connection.getAccountInfo(vaultPda);
    if (newVaultAccount) {
      console.log('\nVault account verified:');
      console.log('- Owner:', newVaultAccount.owner.toBase58());
      console.log('- Size:', newVaultAccount.data.length, 'bytes');
      console.log('- Lamports:', newVaultAccount.lamports);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error.logs) {
      console.error('Program logs:', error.logs);
    }
  }
}

// Run initialization
initializeVault();