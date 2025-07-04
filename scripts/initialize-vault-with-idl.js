const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// Constants
const VAULT_PROGRAM_ID = new PublicKey('DHzZjjPoRmbYvTsXE3Je1JW2M4qgkKsqsuTz3uKHh4qJ');
const MIKO_TOKEN_MINT = new PublicKey('H5KVrB48CTUVsQhYRULzEEZ5LCLxjJWCX7dHeLW4FVEw');

async function initializeVault() {
  try {
    console.log('Loading wallets...');
    
    // Load wallets
    const ownerPath = path.join(__dirname, '../owner-wallet.json');
    const keeperPath = path.join(__dirname, '../keeper-bot-wallet.json');
    const treasuryPath = path.join(__dirname, '../treasury-wallet.json');
    
    const ownerKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(ownerPath, 'utf-8')))
    );
    const keeperKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(keeperPath, 'utf-8')))
    );
    const treasuryKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(treasuryPath, 'utf-8')))
    );
    
    console.log('Owner:', ownerKeypair.publicKey.toBase58());
    console.log('Keeper:', keeperKeypair.publicKey.toBase58());
    console.log('Treasury:', treasuryKeypair.publicKey.toBase58());
    
    // Connect to devnet
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Create provider
    const wallet = new anchor.Wallet(ownerKeypair);
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed'
    });
    anchor.setProvider(provider);
    
    // Load IDL
    const idl = JSON.parse(fs.readFileSync(path.join(__dirname, 'absolute-vault-idl.json'), 'utf-8'));
    
    // Create program interface
    const program = new anchor.Program(idl, VAULT_PROGRAM_ID, provider);
    
    // Derive vault PDA
    const [vaultPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault')],
      program.programId
    );
    
    console.log('\nVault Configuration:');
    console.log('Vault PDA:', vaultPda.toBase58());
    console.log('Program ID:', VAULT_PROGRAM_ID.toBase58());
    console.log('Token Mint:', MIKO_TOKEN_MINT.toBase58());
    
    // Check if vault already exists
    const vaultAccount = await connection.getAccountInfo(vaultPda);
    if (vaultAccount && vaultAccount.owner.equals(VAULT_PROGRAM_ID)) {
      console.log('\n⚠️  Vault is already initialized!');
      
      try {
        const vaultData = await program.account.vaultState.fetch(vaultPda);
        console.log('\nVault State:');
        console.log('- Authority:', vaultData.authority.toBase58());
        console.log('- Token Mint:', vaultData.tokenMint.toBase58());
        console.log('- Owner Wallet:', vaultData.ownerWallet.toBase58());
        console.log('- Treasury:', vaultData.treasury.toBase58());
        console.log('- Keeper Wallet:', vaultData.keeperWallet.toBase58());
        console.log('- Is Initialized:', vaultData.isInitialized);
        console.log('- Total Fees Harvested:', vaultData.totalFeesHarvested.toString());
        console.log('- Total Rewards Distributed:', vaultData.totalRewardsDistributed.toString());
      } catch (e) {
        console.log('Could not fetch vault data:', e.message);
      }
      return;
    }
    
    console.log('\n🚀 Initializing vault...');
    
    try {
      const tx = await program.methods.initialize()
        .accounts({
          vaultState: vaultPda,
          authority: ownerKeypair.publicKey,
          tokenMint: MIKO_TOKEN_MINT,
          owner: ownerKeypair.publicKey,
          treasury: treasuryKeypair.publicKey,
          keeper: keeperKeypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([ownerKeypair])
        .rpc();
      
      console.log('Transaction sent:', tx);
      
      // Wait for confirmation
      await provider.connection.confirmTransaction(tx, 'confirmed');
      
      console.log('\n✅ Vault initialized successfully!');
      
      // Fetch and display vault state
      const vaultData = await program.account.vaultState.fetch(vaultPda);
      console.log('\nVault State:');
      console.log('- Authority:', vaultData.authority.toBase58());
      console.log('- Token Mint:', vaultData.tokenMint.toBase58());
      console.log('- Owner Wallet:', vaultData.ownerWallet.toBase58());
      console.log('- Treasury:', vaultData.treasury.toBase58());
      console.log('- Keeper Wallet:', vaultData.keeperWallet.toBase58());
      console.log('- Is Initialized:', vaultData.isInitialized);
      
    } catch (error) {
      console.error('\n❌ Error initializing vault:', error);
      if (error.logs) {
        console.error('Program logs:', error.logs);
      }
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Run initialization
initializeVault();