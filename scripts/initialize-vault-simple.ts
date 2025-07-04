import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
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
    
    // Derive vault PDA
    const [vaultPda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault')],
        VAULT_PROGRAM_ID
    );
    
    console.log('Initializing Absolute Vault...');
    console.log('Vault PDA:', vaultPda.toBase58());
    console.log('Authority:', ownerKeypair.publicKey.toBase58());
    console.log('Treasury:', treasuryKeypair.publicKey.toBase58());
    console.log('Keeper:', keeperKeypair.publicKey.toBase58());
    console.log('Token Mint:', MIKO_TOKEN_MINT.toBase58());
    
    try {
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
        
        console.log('Vault initialized successfully!');
        console.log('Transaction signature:', signature);
        
        // Try to fetch vault data
        const accountInfo = await connection.getAccountInfo(vaultPda);
        if (accountInfo) {
            console.log('\nVault account created successfully');
            console.log('Account size:', accountInfo.data.length, 'bytes');
            console.log('Account owner:', accountInfo.owner.toBase58());
        }
        
    } catch (error) {
        console.error('Error initializing vault:', error);
    }
}

initializeVault();