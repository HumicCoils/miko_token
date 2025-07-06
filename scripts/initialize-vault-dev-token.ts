import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
    SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
    TOKEN_2022_PROGRAM_ID,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import * as borsh from 'borsh';

// Constants
const VAULT_PROGRAM_ID = new PublicKey('DHzZjjPoRmbYvTsXE3Je1JW2M4qgkKsqsuTz3uKHh4qJ');
const MIKO_DEV_TOKEN_MINT = new PublicKey('PBbVBUPWMzC2LVu4Qb51qJfpp6XfGjY5nCGJhoUWYUf');

// Load wallet helper
function loadWallet(filePath: string): Keypair {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(data));
}

// Calculate discriminator
function getDiscriminator(instructionName: string): Buffer {
    const preimage = `global:${instructionName}`;
    const hash = createHash('sha256').update(preimage).digest();
    return hash.slice(0, 8);
}

// Initialize params schema
class InitializeParams {
    price_feed_id: number[];
    minimum_usd_value: number;

    constructor(fields: { price_feed_id: number[], minimum_usd_value: number }) {
        this.price_feed_id = fields.price_feed_id;
        this.minimum_usd_value = fields.minimum_usd_value;
    }
}

const initializeParamsSchema = new Map([
    [InitializeParams, {
        kind: 'struct',
        fields: [
            ['price_feed_id', [32]],
            ['minimum_usd_value', 'u64']
        ]
    }]
]);

async function initializeVaultForDevToken() {
    console.log('🚀 Initializing Absolute Vault for MIKO Dev-Token...\n');

    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Load wallets
    const authority = loadWallet('../owner-wallet.json');
    const treasury = loadWallet('../treasury-wallet.json');
    const keeper = loadWallet('../keeper-bot-wallet.json');

    console.log('📋 Configuration:');
    console.log(`  Program ID: ${VAULT_PROGRAM_ID.toBase58()}`);
    console.log(`  Dev Token Mint: ${MIKO_DEV_TOKEN_MINT.toBase58()}`);
    console.log(`  Authority: ${authority.publicKey.toBase58()}`);
    console.log(`  Treasury: ${treasury.publicKey.toBase58()}`);
    console.log(`  Keeper: ${keeper.publicKey.toBase58()}\n`);

    // Derive PDAs
    const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault')],
        VAULT_PROGRAM_ID
    );

    const [treasuryVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('treasury_vault'), MIKO_DEV_TOKEN_MINT.toBuffer()],
        VAULT_PROGRAM_ID
    );

    const [ownerVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('owner_vault'), MIKO_DEV_TOKEN_MINT.toBuffer()],
        VAULT_PROGRAM_ID
    );

    console.log('🔑 Derived PDAs:');
    console.log(`  Vault State: ${vaultPda.toBase58()}`);
    console.log(`  Treasury Vault: ${treasuryVault.toBase58()}`);
    console.log(`  Owner Vault: ${ownerVault.toBase58()}\n`);

    try {
        // Check if vault is already initialized
        const vaultAccount = await connection.getAccountInfo(vaultPda);
        if (vaultAccount) {
            console.log('⚠️  Vault already initialized for this program!');
            console.log('   The vault can only be initialized once per program deployment.');
            return;
        }

        // Create initialization params
        const params = new InitializeParams({
            price_feed_id: Array(32).fill(0), // Placeholder for now
            minimum_usd_value: 100 // $100 minimum
        });

        // Serialize params
        const paramsBuffer = borsh.serialize(initializeParamsSchema, params);
        
        // Get discriminator
        const discriminator = getDiscriminator('initialize');
        
        // Combine discriminator and params
        const instructionData = Buffer.concat([discriminator, paramsBuffer]);

        console.log('📦 Creating initialization transaction...');

        // Create instruction
        const initializeIx = new TransactionInstruction({
            keys: [
                { pubkey: vaultPda, isSigner: false, isWritable: true },
                { pubkey: authority.publicKey, isSigner: true, isWritable: true },
                { pubkey: keeper.publicKey, isSigner: false, isWritable: false },
                { pubkey: treasury.publicKey, isSigner: false, isWritable: false },
                { pubkey: authority.publicKey, isSigner: false, isWritable: false }, // owner = authority
                { pubkey: MIKO_DEV_TOKEN_MINT, isSigner: false, isWritable: false },
                { pubkey: treasuryVault, isSigner: false, isWritable: true },
                { pubkey: ownerVault, isSigner: false, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
            ],
            programId: VAULT_PROGRAM_ID,
            data: instructionData,
        });

        const tx = new Transaction().add(initializeIx);

        console.log('📤 Sending transaction...');
        const signature = await sendAndConfirmTransaction(
            connection,
            tx,
            [authority],
            { commitment: 'confirmed' }
        );

        console.log('✅ Vault initialized successfully!');
        console.log(`   Transaction: ${signature}`);
        console.log(`   Vault PDA: ${vaultPda.toBase58()}`);

        // Save vault info
        const vaultInfo = {
            vaultPda: vaultPda.toBase58(),
            programId: VAULT_PROGRAM_ID.toBase58(),
            devTokenMint: MIKO_DEV_TOKEN_MINT.toBase58(),
            authority: authority.publicKey.toBase58(),
            treasury: treasury.publicKey.toBase58(),
            keeper: keeper.publicKey.toBase58(),
            treasuryVault: treasuryVault.toBase58(),
            ownerVault: ownerVault.toBase58(),
            initTx: signature,
            timestamp: new Date().toISOString(),
            isDevToken: true
        };

        fs.writeFileSync('./vault-dev-info.json', JSON.stringify(vaultInfo, null, 2));
        console.log('\n💾 Vault info saved to vault-dev-info.json');

        // Initialize system exclusions
        console.log('\n🔐 Initializing system exclusions...');
        const exclusionDiscriminator = getDiscriminator('initialize_system_exclusions');
        
        const exclusionIx = new TransactionInstruction({
            keys: [
                { pubkey: vaultPda, isSigner: false, isWritable: true },
                { pubkey: authority.publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
            ],
            programId: VAULT_PROGRAM_ID,
            data: exclusionDiscriminator,
        });

        const exclusionTx = new Transaction().add(exclusionIx);
        const exclusionSig = await sendAndConfirmTransaction(
            connection,
            exclusionTx,
            [authority],
            { commitment: 'confirmed' }
        );

        console.log('✅ System exclusions initialized!');
        console.log(`   Transaction: ${exclusionSig}`);

        console.log('\n🎉 Vault setup complete for Dev-Token testing!');

    } catch (error) {
        console.error('❌ Error initializing vault:', error);
        throw error;
    }
}

// Run the script
if (require.main === module) {
    initializeVaultForDevToken()
        .then(() => {
            console.log('\n✅ Script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Script failed:', error);
            process.exit(1);
        });
}

export { initializeVaultForDevToken };