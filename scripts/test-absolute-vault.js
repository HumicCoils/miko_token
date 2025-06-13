const { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, Keypair } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// Program IDs
const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("838Ra5u255By2HkV7mtzP6KFgXnjrQiQDB3Gmdpbrf2d");
const SMART_DIAL_PROGRAM_ID = new PublicKey("67sZQtNqoRs5RjncYXMaeRAGrgUK49GSaLJCvHA2SXrj");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// Initialize instruction discriminator
// Using sighash of "global:initialize"
function getDiscriminator(instructionName) {
    const hash = crypto.createHash('sha256').update(`global:${instructionName}`).digest();
    return hash.slice(0, 8);
}

async function main() {
    console.log("Testing Absolute Vault initialization...");
    
    // Load wallet
    const walletPath = path.join(os.homedir(), ".config/solana/deployer-test.json");
    const walletKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
    );
    
    // Create connection
    const connection = new Connection("https://solana-devnet.g.alchemy.com/v2/2jGjgPNpf7uX1gGZVT9Lp8uF_elh2PL5", "confirmed");
    
    console.log("Wallet:", walletKeypair.publicKey.toString());
    
    // Derive PDAs
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
    
    console.log("\nPDAs:");
    console.log("Tax Config:", taxConfig.toString(), "bump:", taxConfigBump);
    console.log("Tax Authority:", taxAuthorityPda.toString(), "bump:", taxAuthorityBump);
    console.log("Tax Holding:", taxHoldingPda.toString(), "bump:", taxHoldingBump);
    
    // Check if already initialized
    const taxConfigAccount = await connection.getAccountInfo(taxConfig);
    if (taxConfigAccount) {
        console.log("\n⚠️  Tax config account already exists");
        console.log("Account owner:", taxConfigAccount.owner.toString());
        console.log("Account data length:", taxConfigAccount.data.length);
        return;
    }
    
    // Create instruction
    const discriminator = getDiscriminator("initialize");
    console.log("\nDiscriminator:", discriminator.toString('hex'));
    
    // Build instruction data
    const instructionData = Buffer.concat([
        discriminator,
        SMART_DIAL_PROGRAM_ID.toBuffer()
    ]);
    
    const tokenMint = SystemProgram.programId; // Using system program as placeholder
    
    const initIx = new TransactionInstruction({
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
        data: instructionData
    });
    
    console.log("\nInstruction accounts:");
    initIx.keys.forEach((key, i) => {
        console.log(`${i}: ${key.pubkey.toString()} (signer: ${key.isSigner}, writable: ${key.isWritable})`);
    });
    
    // Send transaction
    console.log("\nSending transaction...");
    const tx = new Transaction().add(initIx);
    
    try {
        const sig = await connection.sendTransaction(tx, [walletKeypair], {
            skipPreflight: true,
            preflightCommitment: "confirmed"
        });
        
        console.log("Transaction sent:", sig);
        
        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(sig, "confirmed");
        console.log("Transaction confirmed:", confirmation);
        
    } catch (error) {
        console.error("Transaction failed:", error);
        
        // Try to get logs
        if (error.logs) {
            console.log("\nProgram logs:");
            error.logs.forEach(log => console.log(log));
        }
    }
}

main().catch(console.error);