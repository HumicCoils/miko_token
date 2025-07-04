import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, setProvider, workspace } from '@coral-xyz/anchor';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

// Constants
const VAULT_PROGRAM_ID = new PublicKey('DHzZjjPoRmbYvTsXE3Je1JW2M4qgkKsqsuTz3uKHh4qJ');
const MIKO_TOKEN_MINT = new PublicKey('H5KVrB48CTUVsQhYRULzEEZ5LCLxjJWCX7dHeLW4FVEw');

async function initializeVault() {
    // Load owner wallet
    const ownerKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(readFileSync('./owner-wallet.json', 'utf-8')))
    );
    
    // Load keeper wallet
    const keeperKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(readFileSync('./keeper-bot-wallet.json', 'utf-8')))
    );
    
    // Load treasury wallet
    const treasuryKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(readFileSync('./treasury-wallet.json', 'utf-8')))
    );
    
    // Connect to devnet
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Create provider
    const provider = new AnchorProvider(
        connection,
        {
            publicKey: ownerKeypair.publicKey,
            signTransaction: async (tx) => {
                tx.sign(ownerKeypair);
                return tx;
            },
            signAllTransactions: async (txs) => {
                txs.forEach(tx => tx.sign(ownerKeypair));
                return txs;
            }
        },
        { commitment: 'confirmed' }
    );
    setProvider(provider);
    
    // Load the program IDL
    const idl = JSON.parse(readFileSync('./programs/absolute-vault/target/idl/absolute_vault.json', 'utf-8'));
    const program = new Program(idl, VAULT_PROGRAM_ID, provider);
    
    // Derive vault PDA
    const [vaultPda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault')],
        program.programId
    );
    
    console.log('Initializing Absolute Vault...');
    console.log('Vault PDA:', vaultPda.toBase58());
    console.log('Authority:', ownerKeypair.publicKey.toBase58());
    console.log('Treasury:', treasuryKeypair.publicKey.toBase58());
    console.log('Keeper:', keeperKeypair.publicKey.toBase58());
    console.log('Token Mint:', MIKO_TOKEN_MINT.toBase58());
    
    try {
        // Initialize the vault
        const tx = await program.methods.initialize()
            .accounts({
                vaultState: vaultPda,
                authority: ownerKeypair.publicKey,
                tokenMint: MIKO_TOKEN_MINT,
                owner: ownerKeypair.publicKey,
                treasury: treasuryKeypair.publicKey,
                keeper: keeperKeypair.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([ownerKeypair])
            .rpc();
        
        console.log('Vault initialized successfully!');
        console.log('Transaction signature:', tx);
        
        // Fetch and display vault state
        const vaultState = await program.account.vaultState.fetch(vaultPda);
        console.log('\nVault State:');
        console.log('- Authority:', vaultState.authority.toBase58());
        console.log('- Token Mint:', vaultState.tokenMint.toBase58());
        console.log('- Owner Wallet:', vaultState.ownerWallet.toBase58());
        console.log('- Treasury:', vaultState.treasury.toBase58());
        console.log('- Keeper Wallet:', vaultState.keeperWallet.toBase58());
        console.log('- Is Initialized:', vaultState.isInitialized);
        
    } catch (error) {
        console.error('Error initializing vault:', error);
    }
}

initializeVault();