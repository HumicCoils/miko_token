import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';
import { BN } from 'bn.js';

dotenv.config();

// Constants
const VAULT_PROGRAM_ID = new PublicKey('DHzZjjPoRmbYvTsXE3Je1JW2M4qgkKsqsuTz3uKHh4qJ');
const MIKO_TOKEN_MINT = new PublicKey('H5KVrB48CTUVsQhYRULzEEZ5LCLxjJWCX7dHeLW4FVEw');

// Manual IDL definition based on our program structure
const IDL = {
  version: "0.1.0",
  name: "absolute_vault",
  instructions: [
    {
      name: "initialize",
      accounts: [
        { name: "vaultState", isMut: true, isSigner: false },
        { name: "authority", isMut: true, isSigner: true },
        { name: "tokenMint", isMut: false, isSigner: false },
        { name: "owner", isMut: false, isSigner: false },
        { name: "treasury", isMut: false, isSigner: false },
        { name: "keeper", isMut: false, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: []
    }
  ],
  accounts: [
    {
      name: "VaultState",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "publicKey" },
          { name: "tokenMint", type: "publicKey" },
          { name: "ownerWallet", type: "publicKey" },
          { name: "treasury", type: "publicKey" },
          { name: "keeperWallet", type: "publicKey" },
          { name: "totalFeesHarvested", type: "u64" },
          { name: "totalRewardsDistributed", type: "u64" },
          { name: "lastHarvestTimestamp", type: "i64" },
          { name: "lastDistributionTimestamp", type: "i64" },
          { name: "isInitialized", type: "bool" },
          { name: "bump", type: "u8" }
        ]
      }
    }
  ]
};

async function initializeVault() {
  try {
    console.log('Loading wallets...');
    
    // Load wallets - check if they exist first
    let ownerKeypair: Keypair;
    let keeperKeypair: Keypair;
    let treasuryKeypair: Keypair;
    
    try {
      ownerKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(readFileSync('../owner-wallet.json', 'utf-8')))
      );
    } catch (e) {
      console.log('Owner wallet not found, generating new one...');
      ownerKeypair = Keypair.generate();
      const ownerData = JSON.stringify(Array.from(ownerKeypair.secretKey));
      require('fs').writeFileSync('../owner-wallet.json', ownerData);
      console.log('Owner wallet created:', ownerKeypair.publicKey.toBase58());
    }
    
    try {
      keeperKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(readFileSync('../keeper-bot-wallet.json', 'utf-8')))
      );
    } catch (e) {
      console.log('Keeper wallet not found, generating new one...');
      keeperKeypair = Keypair.generate();
      const keeperData = JSON.stringify(Array.from(keeperKeypair.secretKey));
      require('fs').writeFileSync('../keeper-bot-wallet.json', keeperData);
      console.log('Keeper wallet created:', keeperKeypair.publicKey.toBase58());
    }
    
    try {
      treasuryKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(readFileSync('../treasury-wallet.json', 'utf-8')))
      );
    } catch (e) {
      console.log('Treasury wallet not found, generating new one...');
      treasuryKeypair = Keypair.generate();
      const treasuryData = JSON.stringify(Array.from(treasuryKeypair.secretKey));
      require('fs').writeFileSync('../treasury-wallet.json', treasuryData);
      console.log('Treasury wallet created:', treasuryKeypair.publicKey.toBase58());
    }
    
    // Connect to devnet
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Create provider
    const wallet = new anchor.Wallet(ownerKeypair);
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed'
    });
    anchor.setProvider(provider);
    
    // Check and airdrop SOL if needed
    console.log('\nChecking wallet balances...');
    const ownerBalance = await connection.getBalance(ownerKeypair.publicKey);
    if (ownerBalance < 1000000000) { // Less than 1 SOL
      console.log('Requesting airdrop for owner wallet...');
      const airdropSig = await connection.requestAirdrop(ownerKeypair.publicKey, 2000000000); // 2 SOL
      await connection.confirmTransaction(airdropSig);
      console.log('Airdrop complete');
    }
    
    // Create program interface - using explicit typing to avoid TS issues
    const program = new anchor.Program(IDL as any, VAULT_PROGRAM_ID, provider);
    
    // Derive vault PDA
    const [vaultPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault')],
      program.programId
    );
    
    console.log('\nInitializing Absolute Vault...');
    console.log('Vault PDA:', vaultPda.toBase58());
    console.log('Authority:', ownerKeypair.publicKey.toBase58());
    console.log('Treasury:', treasuryKeypair.publicKey.toBase58());
    console.log('Keeper:', keeperKeypair.publicKey.toBase58());
    console.log('Token Mint:', MIKO_TOKEN_MINT.toBase58());
    
    // Check if already initialized
    try {
      const vaultAccount = await connection.getAccountInfo(vaultPda);
      if (vaultAccount && vaultAccount.owner.equals(VAULT_PROGRAM_ID)) {
        console.log('\nVault is already initialized!');
        
        // Parse the account data manually
        const data = vaultAccount.data;
        if (data.length >= 169) { // Expected size of VaultState
          console.log('\nVault State:');
          console.log('- Is Initialized:', data[168] === 1);
          console.log('- Account Owner:', vaultAccount.owner.toBase58());
          console.log('- Account Size:', data.length, 'bytes');
        }
        return;
      }
    } catch (e) {
      // Account doesn't exist, proceed with initialization
    }
    
    // Initialize the vault
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
      
      console.log('\nVault initialized successfully!');
      console.log('Transaction signature:', tx);
      
      // Wait for confirmation
      await provider.connection.confirmTransaction(tx, 'confirmed');
      
      // Fetch and verify vault state
      const vaultAccount = await connection.getAccountInfo(vaultPda);
      if (vaultAccount) {
        console.log('\nVault account created successfully');
        console.log('Account owner:', vaultAccount.owner.toBase58());
        console.log('Account size:', vaultAccount.data.length, 'bytes');
      }
      
    } catch (error: any) {
      console.error('\nError initializing vault:', error);
      if (error.logs) {
        console.error('Program logs:', error.logs);
      }
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Run the initialization
initializeVault();