const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Program IDs
const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("838Ra5u255By2HkV7mtzP6KFgXnjrQiQDB3Gmdpbrf2d");
const SMART_DIAL_PROGRAM_ID = new PublicKey("67sZQtNqoRs5RjncYXMaeRAGrgUK49GSaLJCvHA2SXrj");

// Wallet addresses
const KEEPER_BOT_PUBKEY = new PublicKey("CqjraVtYWqwfxZjHPemqoqNu1QYZvjBZoonJxTm7CinG");
const TREASURY_WALLET = new PublicKey("ESEQvotDCxHancsHSsV4UXLPrhyFe6K16ncbJbi9Y4DQ");
const OWNER_WALLET = new PublicKey("FwN6tCpJkHhuYxBKwcrGU6PDW4aRNuukQBi58ay4iYGM");

// Token-2022 program ID
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

async function main() {
    console.log("🚀 Initializing MIKO Token Programs with Anchor 0.29.0");
    console.log("Anchor version:", anchor.VERSION);
    
    // Load wallet
    const walletPath = path.join(os.homedir(), ".config/solana/deployer-test.json");
    const walletKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
    );
    
    // Create connection and provider
    const connection = new anchor.web3.Connection(
        "https://solana-devnet.g.alchemy.com/v2/2jGjgPNpf7uX1gGZVT9Lp8uF_elh2PL5", 
        "confirmed"
    );
    
    const wallet = new anchor.Wallet(walletKeypair);
    const provider = new anchor.AnchorProvider(connection, wallet, {
        commitment: "confirmed",
    });
    anchor.setProvider(provider);
    
    console.log("Connected to:", connection.rpcEndpoint);
    console.log("Wallet:", wallet.publicKey.toString());
    
    // Load IDLs
    const smartDialIdl = require("../target/idl/smart_dial.json");
    const absoluteVaultIdl = require("../target/idl/absolute_vault.json");
    
    // Add the program ID to IDLs
    smartDialIdl.metadata = { address: SMART_DIAL_PROGRAM_ID.toString() };
    absoluteVaultIdl.metadata = { address: ABSOLUTE_VAULT_PROGRAM_ID.toString() };
    
    // Create program instances
    const smartDial = new anchor.Program(smartDialIdl, SMART_DIAL_PROGRAM_ID, provider);
    const absoluteVault = new anchor.Program(absoluteVaultIdl, ABSOLUTE_VAULT_PROGRAM_ID, provider);
    
    try {
        // Initialize Smart Dial first
        console.log("\n📝 Initializing Smart Dial...");
        
        const [smartDialConfig] = PublicKey.findProgramAddressSync(
            [Buffer.from("smart_dial_config")],
            SMART_DIAL_PROGRAM_ID
        );
        
        console.log("Smart Dial Config PDA:", smartDialConfig.toString());
        
        // Check if already initialized
        const smartDialAccount = await connection.getAccountInfo(smartDialConfig);
        if (smartDialAccount) {
            console.log("⚠️  Smart Dial already initialized");
        } else {
            const tx1 = await smartDial.methods
                .initialize(
                    KEEPER_BOT_PUBKEY,
                    TREASURY_WALLET,
                    OWNER_WALLET,
                    "1807336107638001665" // @mikolovescrypto Twitter ID
                )
                .accounts({
                    admin: provider.wallet.publicKey,
                    config: smartDialConfig,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
                
            console.log("✅ Smart Dial initialized:", tx1);
        }
        
        // Initialize Absolute Vault
        console.log("\n📝 Initializing Absolute Vault...");
        
        const [taxConfig] = PublicKey.findProgramAddressSync(
            [Buffer.from("tax_config")],
            ABSOLUTE_VAULT_PROGRAM_ID
        );
        
        const [taxAuthorityPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("tax_authority")],
            ABSOLUTE_VAULT_PROGRAM_ID
        );
        
        const [taxHoldingPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("tax_holding")],
            ABSOLUTE_VAULT_PROGRAM_ID
        );
        
        console.log("Tax Config PDA:", taxConfig.toString());
        
        // Check if already initialized
        const taxConfigAccount = await connection.getAccountInfo(taxConfig);
        if (taxConfigAccount) {
            console.log("⚠️  Absolute Vault already initialized");
        } else {
            // Use a placeholder mint for now
            const tokenMint = new PublicKey("11111111111111111111111111111111");
            
            const tx2 = await absoluteVault.methods
                .initialize(SMART_DIAL_PROGRAM_ID)
                .accounts({
                    authority: provider.wallet.publicKey,
                    taxConfig,
                    taxAuthorityPda,
                    taxHoldingPda,
                    tokenMint,
                    systemProgram: SystemProgram.programId,
                    token2022Program: TOKEN_2022_PROGRAM_ID,
                })
                .rpc();
                
            console.log("✅ Absolute Vault initialized:", tx2);
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
        
        console.log("\n✅ Programs initialized successfully!");
        console.log("Configuration saved to:", outputPath);
        
    } catch (error) {
        console.error("Error:", error);
        if (error.logs) {
            console.error("Program logs:", error.logs);
        }
    }
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});