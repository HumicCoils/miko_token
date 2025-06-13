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
const crypto = require("crypto");

// Program IDs
const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("838Ra5u255By2HkV7mtzP6KFgXnjrQiQDB3Gmdpbrf2d");
const SMART_DIAL_PROGRAM_ID = new PublicKey("67sZQtNqoRs5RjncYXMaeRAGrgUK49GSaLJCvHA2SXrj");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// USDC-Dev mint on devnet
const USDC_DEV_MINT = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");

// Instruction discriminator for "initialize"
const INITIALIZE_DISCRIMINATOR = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);

async function main() {
    console.log("🚀 Raw initialization of Absolute Vault");
    
    // Load wallet
    const walletPath = path.join(os.homedir(), ".config/solana/deployer-test.json");
    const walletKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
    );
    
    // Create connection
    const connection = new Connection("https://solana-devnet.g.alchemy.com/v2/2jGjgPNpf7uX1gGZVT9Lp8uF_elh2PL5", "confirmed");
    
    console.log("Wallet:", walletKeypair.publicKey.toString());
    
    // Derive PDAs
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
    
    console.log("\nPDAs:");
    console.log("Tax Config:", taxConfig.toString());
    console.log("Tax Authority:", taxAuthorityPda.toString());
    console.log("Tax Holding:", taxHoldingPda.toString());
    
    // Check if already initialized
    const taxConfigAccount = await connection.getAccountInfo(taxConfig);
    if (taxConfigAccount) {
        console.log("\n⚠️  Tax config already exists!");
        console.log("Parsing account data...");
        
        // Try to parse the account data
        const data = taxConfigAccount.data;
        console.log("Data length:", data.length);
        console.log("First 100 bytes (hex):", data.slice(0, 100).toString('hex'));
        
        // Parse discriminator (first 8 bytes)
        const discriminator = data.slice(0, 8);
        console.log("Discriminator:", discriminator.toString('hex'));
        
        // Parse fields (assuming standard Anchor layout)
        let offset = 8; // Skip discriminator
        
        // authority: Pubkey (32 bytes)
        const authority = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        console.log("Authority:", authority.toString());
        
        // tax_authority_pda: Pubkey (32 bytes)  
        const taxAuthority = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        console.log("Tax Authority PDA:", taxAuthority.toString());
        
        // tax_holding_pda: Pubkey (32 bytes)
        const taxHolding = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        console.log("Tax Holding PDA:", taxHolding.toString());
        
        // smart_dial_program: Pubkey (32 bytes)
        const smartDialProgram = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        console.log("Smart Dial Program:", smartDialProgram.toString());
        
        // token_mint: Pubkey (32 bytes)
        const tokenMint = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        console.log("Token Mint:", tokenMint.toString());
        
        return;
    }
    
    console.log("\n📝 Creating initialization instruction...");
    
    // Build instruction data
    const instructionData = Buffer.concat([
        INITIALIZE_DISCRIMINATOR,
        SMART_DIAL_PROGRAM_ID.toBuffer()
    ]);
    
    console.log("Instruction data (hex):", instructionData.toString('hex'));
    console.log("Instruction data length:", instructionData.length);
    
    const initIx = new TransactionInstruction({
        programId: ABSOLUTE_VAULT_PROGRAM_ID,
        keys: [
            { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: taxConfig, isSigner: false, isWritable: true },
            { pubkey: taxAuthorityPda, isSigner: false, isWritable: false },
            { pubkey: taxHoldingPda, isSigner: false, isWritable: false },
            { pubkey: USDC_DEV_MINT, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }
        ],
        data: instructionData
    });
    
    console.log("\nSending transaction...");
    const tx = new Transaction().add(initIx);
    
    try {
        // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = walletKeypair.publicKey;
        
        // Sign and send
        tx.sign(walletKeypair);
        const sig = await connection.sendRawTransaction(tx.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed"
        });
        
        console.log("Transaction sent:", sig);
        
        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(sig, "confirmed");
        console.log("Transaction confirmed!");
        
        // Check the account again
        const newAccount = await connection.getAccountInfo(taxConfig);
        if (newAccount) {
            console.log("\n✅ Absolute Vault initialized successfully!");
            console.log("Account size:", newAccount.data.length);
        }
        
    } catch (error) {
        console.error("\n❌ Transaction failed:", error);
        
        // Try to get more details
        if (error.toString().includes("custom program error")) {
            console.log("\nThis is likely the program ID mismatch error.");
            console.log("The program expects a different ID than what it's deployed with.");
        }
    }
}

main().catch(console.error);