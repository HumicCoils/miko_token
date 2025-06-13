const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Program IDs
const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("EMstwrRUs4dWeec9azA9RJB5Qu93A1F5Q34JyN3w4QFC");
const SMART_DIAL_PROGRAM_ID = new PublicKey("67sZQtNqoRs5RjncYXMaeRAGrgUK49GSaLJCvHA2SXrj");

// Token-2022 program ID
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// MIKO Token mint
const MIKO_TOKEN_MINT = new PublicKey("BiQUbqckzG7C4hhv6vCYBeEx7KDEgaXqK1M3x9X67KKh");

async function main() {
    console.log("🚀 Initializing Absolute Vault with MIKO Token");
    
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
        preflightCommitment: "confirmed",
    });
    anchor.setProvider(provider);
    
    console.log("Connected to:", connection.rpcEndpoint);
    console.log("Wallet:", wallet.publicKey.toString());
    console.log("MIKO Token Mint:", MIKO_TOKEN_MINT.toString());
    
    // Load IDL
    const absoluteVaultIdl = require("../target/idl/absolute_vault.json");
    
    // Create program instance
    const absoluteVault = new anchor.Program(absoluteVaultIdl, ABSOLUTE_VAULT_PROGRAM_ID, provider);
    
    try {
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
        console.log("Tax Authority PDA:", taxAuthorityPda.toString());
        console.log("Tax Holding PDA:", taxHoldingPda.toString());
        
        // Check if already initialized
        const taxConfigAccount = await connection.getAccountInfo(taxConfig);
        if (taxConfigAccount) {
            console.log("⚠️  Absolute Vault already initialized");
            return;
        }
        
        console.log("\nInitializing with:");
        console.log("- Smart Dial Program:", SMART_DIAL_PROGRAM_ID.toString());
        console.log("- MIKO Token Mint:", MIKO_TOKEN_MINT.toString());
        
        const tx = await absoluteVault.methods
            .initialize(SMART_DIAL_PROGRAM_ID)
            .accounts({
                authority: provider.wallet.publicKey,
                taxConfig,
                taxAuthorityPda,
                taxHoldingPda,
                tokenMint: MIKO_TOKEN_MINT,
                systemProgram: SystemProgram.programId,
                token2022Program: TOKEN_2022_PROGRAM_ID,
            })
            .rpc({ 
                skipPreflight: false,
                commitment: "confirmed"
            });
            
        console.log("✅ Absolute Vault initialized:", tx);
        
        // Update configuration
        const configPath = path.join(__dirname, "..", "miko-token-config.json");
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        config.absoluteVault = {
            programId: ABSOLUTE_VAULT_PROGRAM_ID.toString(),
            taxConfig: taxConfig.toString(),
            taxAuthorityPda: taxAuthorityPda.toString(),
            taxHoldingPda: taxHoldingPda.toString(),
            initialized: true,
        };
        config.status.absoluteVaultInitialized = true;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        console.log("\n✅ Absolute Vault initialized successfully!");
        console.log("The 5% tax mechanism is now active on MIKO token transfers");
        
    } catch (error) {
        console.error("Error:", error);
        if (error.logs) {
            console.error("\nProgram logs:");
            error.logs.forEach(log => console.log(log));
        }
        if (error.simulationResponse) {
            console.error("\nSimulation response:", JSON.stringify(error.simulationResponse, null, 2));
        }
    }
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});