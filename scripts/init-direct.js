const { 
    Connection, 
    PublicKey, 
    Keypair, 
    SystemProgram, 
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction 
} = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
const os = require("os");
const BN = require("bn.js");

// Program IDs
const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("838Ra5u255By2HkV7mtzP6KFgXnjrQiQDB3Gmdpbrf2d");
const SMART_DIAL_PROGRAM_ID = new PublicKey("67sZQtNqoRs5RjncYXMaeRAGrgUK49GSaLJCvHA2SXrj");

// Wallet addresses
const KEEPER_BOT_PUBKEY = new PublicKey("CqjraVtYWqwfxZjHPemqoqNu1QYZvjBZoonJxTm7CinG");
const TREASURY_WALLET = new PublicKey("ESEQvotDCxHancsHSsV4UXLPrhyFe6K16ncbJbi9Y4DQ");
const OWNER_WALLET = new PublicKey("FwN6tCpJkHhuYxBKwcrGU6PDW4aRNuukQBi58ay4iYGM");

// Token-2022 program ID
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// Instruction discriminators (first 8 bytes of sha256 hash of "global:initialize")
const SMART_DIAL_INIT_DISCRIMINATOR = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);
const ABSOLUTE_VAULT_INIT_DISCRIMINATOR = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);

async function main() {
    console.log("🚀 Initializing MIKO Token Programs (Direct)");
    
    // Load wallet
    const walletPath = path.join(os.homedir(), ".config/solana/deployer-test.json");
    const walletKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
    );
    
    // Create connection
    const connection = new Connection("https://solana-devnet.g.alchemy.com/v2/2jGjgPNpf7uX1gGZVT9Lp8uF_elh2PL5", "confirmed");
    
    console.log("Connected to:", connection.rpcEndpoint);
    console.log("Wallet:", walletKeypair.publicKey.toString());
    
    try {
        // Initialize Smart Dial first
        console.log("\n📝 Initializing Smart Dial...");
        
        const [smartDialConfig, smartDialBump] = PublicKey.findProgramAddressSync(
            [Buffer.from("smart_dial_config")],
            SMART_DIAL_PROGRAM_ID
        );
        
        console.log("Smart Dial Config PDA:", smartDialConfig.toString());
        
        // Check if already initialized
        const smartDialAccount = await connection.getAccountInfo(smartDialConfig);
        if (smartDialAccount) {
            console.log("⚠️  Smart Dial already initialized");
        } else {
            // Build instruction data for Smart Dial initialize
            const smartDialData = Buffer.concat([
                SMART_DIAL_INIT_DISCRIMINATOR,
                KEEPER_BOT_PUBKEY.toBuffer(),
                TREASURY_WALLET.toBuffer(),
                OWNER_WALLET.toBuffer(),
                Buffer.from([19, 0, 0, 0]), // string length (19 bytes)
                Buffer.from("1807336107638001665") // Twitter ID
            ]);
            
            const smartDialIx = new TransactionInstruction({
                programId: SMART_DIAL_PROGRAM_ID,
                keys: [
                    { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
                    { pubkey: smartDialConfig, isSigner: false, isWritable: true },
                    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
                ],
                data: smartDialData
            });
            
            const tx1 = new Transaction().add(smartDialIx);
            const sig1 = await sendAndConfirmTransaction(connection, tx1, [walletKeypair]);
            console.log("✅ Smart Dial initialized:", sig1);
        }
        
        // Initialize Absolute Vault
        console.log("\n📝 Initializing Absolute Vault...");
        
        const [taxConfig, taxConfigBump] = PublicKey.findProgramAddressSync(
            [Buffer.from("tax_config")],
            ABSOLUTE_VAULT_PROGRAM_ID
        );
        
        const [taxAuthorityPda, taxAuthorityBump] = PublicKey.findProgramAddressSync(
            [Buffer.from("tax_authority")],
            ABSOLUTE_VAULT_PROGRAM_ID
        );
        
        const [taxHoldingPda, taxHoldingBump] = PublicKey.findProgramAddressSync(
            [Buffer.from("tax_holding")],
            ABSOLUTE_VAULT_PROGRAM_ID
        );
        
        console.log("Tax Config PDA:", taxConfig.toString());
        console.log("Tax Authority PDA:", taxAuthorityPda.toString());
        console.log("Tax Holding PDA:", taxHoldingPda.toString());
        
        // Check if already initialized
        const taxConfigAccount = await connection.getAccountInfo(taxConfig);
        if (taxConfigAccount) {
            console.log("⚠️  Absolute Vault already initialized");
        } else {
            // Use a placeholder mint for now
            const tokenMint = new PublicKey("11111111111111111111111111111111");
            
            // Build instruction data for Absolute Vault initialize
            const absoluteVaultData = Buffer.concat([
                ABSOLUTE_VAULT_INIT_DISCRIMINATOR,
                SMART_DIAL_PROGRAM_ID.toBuffer()
            ]);
            
            const absoluteVaultIx = new TransactionInstruction({
                programId: ABSOLUTE_VAULT_PROGRAM_ID,
                keys: [
                    { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
                    { pubkey: taxConfig, isSigner: false, isWritable: true },
                    { pubkey: taxAuthorityPda, isSigner: false, isWritable: false },
                    { pubkey: taxHoldingPda, isSigner: false, isWritable: false },
                    { pubkey: tokenMint, isSigner: false, isWritable: false },
                    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }
                ],
                data: absoluteVaultData
            });
            
            const tx2 = new Transaction().add(absoluteVaultIx);
            const sig2 = await sendAndConfirmTransaction(connection, tx2, [walletKeypair]);
            console.log("✅ Absolute Vault initialized:", sig2);
        }
        
        // Save initialization info
        const initInfo = {
            network: "devnet",
            absoluteVault: {
                programId: ABSOLUTE_VAULT_PROGRAM_ID.toString(),
                taxConfig: taxConfig.toString(),
                taxAuthorityPda: taxAuthorityPda.toString(),
                taxHoldingPda: taxHoldingPda.toString(),
            },
            smartDial: {
                programId: SMART_DIAL_PROGRAM_ID.toString(),
                config: smartDialConfig.toString(),
            },
            wallets: {
                keeperBot: KEEPER_BOT_PUBKEY.toString(),
                treasury: TREASURY_WALLET.toString(),
                owner: OWNER_WALLET.toString(),
            },
            initializedAt: new Date().toISOString(),
        };
        
        const outputPath = path.join(__dirname, "..", "initialized-programs.json");
        fs.writeFileSync(outputPath, JSON.stringify(initInfo, null, 2));
        
        console.log("\n✅ Programs configuration saved!");
        console.log("Details saved to:", outputPath);
        
    } catch (error) {
        console.error("Error:", error);
    }
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});