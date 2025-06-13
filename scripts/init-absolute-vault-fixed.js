const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Program IDs
const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("838Ra5u255By2HkV7mtzP6KFgXnjrQiQDB3Gmdpbrf2d");
const SMART_DIAL_PROGRAM_ID = new PublicKey("67sZQtNqoRs5RjncYXMaeRAGrgUK49GSaLJCvHA2SXrj");

// Token-2022 program ID
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// Use USDC-Dev token mint from devnet as a valid test token
const USDC_DEV_MINT = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");

async function main() {
    console.log("🚀 Initializing Absolute Vault Program (Fixed)");
    
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
    
    // Update IDL with metadata
    const absoluteVaultIdl = require("../target/idl/absolute_vault.json");
    
    // Create program instance WITHOUT metadata (let Anchor figure it out)
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
            console.log("Account data:", taxConfigAccount.data);
            return;
        }
        
        console.log("\nInitializing with:");
        console.log("- Smart Dial Program:", SMART_DIAL_PROGRAM_ID.toString());
        console.log("- Token Mint:", USDC_DEV_MINT.toString());
        
        // Try different approach - use manual instruction construction
        const accounts = {
            authority: provider.wallet.publicKey,
            taxConfig,
            taxAuthorityPda,
            taxHoldingPda,
            tokenMint: USDC_DEV_MINT,
            systemProgram: SystemProgram.programId,
            token2022Program: TOKEN_2022_PROGRAM_ID,
        };
        
        console.log("\nAccounts for initialization:");
        Object.entries(accounts).forEach(([key, value]) => {
            console.log(`- ${key}: ${value.toString()}`);
        });
        
        const tx = await absoluteVault.methods
            .initialize(SMART_DIAL_PROGRAM_ID)
            .accounts(accounts)
            .rpc({ 
                skipPreflight: false,
                commitment: "confirmed"
            });
            
        console.log("✅ Absolute Vault initialized:", tx);
        
        // Save initialization info
        const initInfo = {
            network: "devnet",
            absoluteVault: {
                programId: ABSOLUTE_VAULT_PROGRAM_ID.toString(),
                taxConfig: taxConfig.toString(),
                taxAuthorityPda: taxAuthorityPda.toString(),
                taxHoldingPda: taxHoldingPda.toString(),
                initialized: true,
            },
            smartDial: {
                programId: SMART_DIAL_PROGRAM_ID.toString(),
                config: "3fsV8dag2QiqtoYRmP5LHNKJEKnYhny2WDtATtNfpw4M",
                initialized: true,
            },
            initializedAt: new Date().toISOString(),
        };
        
        const outputPath = path.join(__dirname, "..", "initialized-programs.json");
        fs.writeFileSync(outputPath, JSON.stringify(initInfo, null, 2));
        
        console.log("\n✅ Absolute Vault initialized successfully!");
        console.log("Configuration saved to:", outputPath);
        
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