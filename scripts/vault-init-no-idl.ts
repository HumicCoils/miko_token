import { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  Transaction, 
  TransactionInstruction,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY
} from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Constants
const VAULT_PROGRAM_ID = new PublicKey('DHzZjjPoRmbYvTsXE3Je1JW2M4qgkKsqsuTz3uKHh4qJ');
const MIKO_TOKEN_MINT = new PublicKey('H5KVrB48CTUVsQhYRULzEEZ5LCLxjJWCX7dHeLW4FVEw');
const VAULT_SEED = Buffer.from('vault');

// Helper function to calculate instruction discriminator
function getDiscriminator(instructionName: string): Buffer {
    const preimage = `global:${instructionName}`;
    const hash = createHash('sha256').update(preimage).digest();
    return hash.slice(0, 8);
}

// Serialize initialize instruction parameters
function serializeInitializeParams(params: {
    treasury: PublicKey,
    ownerWallet: PublicKey,
    keeperWallet: PublicKey,
    minHoldAmount: BN
}): Buffer {
    const buffer = Buffer.alloc(32 + 32 + 32 + 8); // 104 bytes total
    let offset = 0;
    
    // Treasury pubkey: 32 bytes
    params.treasury.toBuffer().copy(buffer, offset);
    offset += 32;
    
    // Owner wallet pubkey: 32 bytes
    params.ownerWallet.toBuffer().copy(buffer, offset);
    offset += 32;
    
    // Keeper wallet pubkey: 32 bytes
    params.keeperWallet.toBuffer().copy(buffer, offset);
    offset += 32;
    
    // Min hold amount u64: 8 bytes (little-endian)
    buffer.writeBigUInt64LE(BigInt(params.minHoldAmount.toString()), offset);
    
    return buffer;
}

// Load or create wallet
function loadOrCreateWallet(walletPath: string, walletName: string): Keypair {
    try {
        const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
        const keypair = Keypair.fromSecretKey(Uint8Array.from(walletData));
        console.log(`${walletName} wallet loaded:`, keypair.publicKey.toBase58());
        return keypair;
    } catch (e) {
        console.log(`${walletName} wallet not found, creating new one...`);
        const keypair = Keypair.generate();
        fs.writeFileSync(walletPath, JSON.stringify(Array.from(keypair.secretKey)));
        console.log(`${walletName} wallet created:`, keypair.publicKey.toBase58());
        return keypair;
    }
}

async function initializeVault() {
    try {
        console.log('🚀 Starting Absolute Vault Initialization (No IDL)\n');
        
        // Load wallets
        const ownerKeypair = loadOrCreateWallet(
            path.join(__dirname, '../owner-wallet.json'),
            'Owner'
        );
        const keeperKeypair = loadOrCreateWallet(
            path.join(__dirname, '../keeper-bot-wallet.json'),
            'Keeper'
        );
        const treasuryKeypair = loadOrCreateWallet(
            path.join(__dirname, '../treasury-wallet.json'),
            'Treasury'
        );
        
        // Connect to devnet
        const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
        
        // Check and request airdrop if needed
        const balance = await connection.getBalance(ownerKeypair.publicKey);
        console.log(`\nOwner balance: ${balance / 1e9} SOL`);
        
        if (balance < 0.1 * 1e9) {
            console.log('Requesting airdrop...');
            const sig = await connection.requestAirdrop(ownerKeypair.publicKey, 2 * 1e9);
            await connection.confirmTransaction(sig);
            console.log('Airdrop completed');
        }
        
        // Derive vault PDA
        const [vaultPda, bump] = PublicKey.findProgramAddressSync(
            [VAULT_SEED],
            VAULT_PROGRAM_ID
        );
        
        console.log('\n📋 Vault Configuration:');
        console.log('Vault PDA:', vaultPda.toBase58());
        console.log('Vault Bump:', bump);
        console.log('Program ID:', VAULT_PROGRAM_ID.toBase58());
        console.log('Token Mint:', MIKO_TOKEN_MINT.toBase58());
        console.log('Authority:', ownerKeypair.publicKey.toBase58());
        console.log('Treasury:', treasuryKeypair.publicKey.toBase58());
        console.log('Keeper:', keeperKeypair.publicKey.toBase58());
        
        // Check if vault already exists
        const vaultAccount = await connection.getAccountInfo(vaultPda);
        if (vaultAccount && vaultAccount.owner.equals(VAULT_PROGRAM_ID)) {
            console.log('\n⚠️  Vault already initialized!');
            console.log('Account size:', vaultAccount.data.length, 'bytes');
            
            // Try to decode some basic info
            if (vaultAccount.data.length >= 40) {
                const discriminator = vaultAccount.data.slice(0, 8);
                const authority = new PublicKey(vaultAccount.data.slice(8, 40));
                console.log('Discriminator:', discriminator.toString('hex'));
                console.log('Authority:', authority.toBase58());
            }
            return;
        }
        
        console.log('\n🔨 Building initialization instruction...');
        
        // Calculate discriminator for "initialize" instruction
        const discriminator = getDiscriminator('initialize');
        console.log('Instruction discriminator:', discriminator.toString('hex'));
        
        // Set minimum hold amount to $100 worth (using 100 * 10^9 as placeholder)
        const minHoldAmount = new BN(100).mul(new BN(10).pow(new BN(9)));
        
        // Serialize parameters
        const params = serializeInitializeParams({
            treasury: treasuryKeypair.publicKey,
            ownerWallet: ownerKeypair.publicKey,
            keeperWallet: keeperKeypair.publicKey,
            minHoldAmount: minHoldAmount
        });
        
        // Combine discriminator and parameters
        const instructionData = Buffer.concat([discriminator, params]);
        console.log('Instruction data size:', instructionData.length, 'bytes');
        console.log('Instruction data (hex):', instructionData.toString('hex'));
        
        // Build accounts array matching the Initialize struct
        const accounts = [
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: ownerKeypair.publicKey, isSigner: true, isWritable: true }, // authority
            { pubkey: MIKO_TOKEN_MINT, isSigner: false, isWritable: false }, // token_mint
            { pubkey: MIKO_TOKEN_MINT, isSigner: false, isWritable: false }, // reward_token_mint (initially same as MIKO)
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
            { pubkey: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'), isSigner: false, isWritable: false }, // token_program (Token2022)
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, // rent sysvar
        ];
        
        // Create instruction
        const instruction = new TransactionInstruction({
            programId: VAULT_PROGRAM_ID,
            keys: accounts,
            data: instructionData,
        });
        
        // Create and send transaction
        const transaction = new Transaction().add(instruction);
        
        console.log('\n📤 Sending transaction...');
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [ownerKeypair],
            {
                commitment: 'confirmed',
                preflightCommitment: 'confirmed',
            }
        );
        
        console.log('\n✅ Vault initialized successfully!');
        console.log('Transaction signature:', signature);
        console.log('View on explorer: https://explorer.solana.com/tx/' + signature + '?cluster=devnet');
        
        // Verify vault creation
        const newVaultAccount = await connection.getAccountInfo(vaultPda);
        if (newVaultAccount) {
            console.log('\n📊 Vault account verified:');
            console.log('- Owner:', newVaultAccount.owner.toBase58());
            console.log('- Size:', newVaultAccount.data.length, 'bytes');
            console.log('- Lamports:', newVaultAccount.lamports);
            console.log('- Executable:', newVaultAccount.executable);
            
            // Save vault info for future reference
            const vaultInfo = {
                vaultPda: vaultPda.toBase58(),
                programId: VAULT_PROGRAM_ID.toBase58(),
                tokenMint: MIKO_TOKEN_MINT.toBase58(),
                authority: ownerKeypair.publicKey.toBase58(),
                treasury: treasuryKeypair.publicKey.toBase58(),
                keeper: keeperKeypair.publicKey.toBase58(),
                initTx: signature,
                timestamp: new Date().toISOString()
            };
            
            fs.writeFileSync(
                path.join(__dirname, 'vault-info.json'),
                JSON.stringify(vaultInfo, null, 2)
            );
            console.log('\n💾 Vault info saved to vault-info.json');
        }
        
    } catch (error: any) {
        console.error('\n❌ Error initializing vault:', error);
        if (error.logs) {
            console.error('\n📜 Program logs:');
            error.logs.forEach((log: string) => console.error(log));
        }
    }
}

// Run initialization
initializeVault();