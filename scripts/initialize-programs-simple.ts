import { Connection, PublicKey, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Load environment variables
const KEEPER_BOT_PUBKEY = process.env.KEEPER_BOT_PUBKEY!;
const TREASURY_WALLET = process.env.TREASURY_WALLET!;
const OWNER_WALLET = process.env.OWNER_WALLET!;

// Program IDs from deployment
const ABSOLUTE_VAULT_PROGRAM_ID = "838Ra5u255By2HkV7mtzP6KFgXnjrQiQDB3Gmdpbrf2d";
const SMART_DIAL_PROGRAM_ID = "67sZQtNqoRs5RjncYXMaeRAGrgUK49GSaLJCvHA2SXrj";

async function main() {
    console.log("🚀 Initializing MIKO Token Programs (Simple Version)");
    
    // Validate environment variables
    if (!KEEPER_BOT_PUBKEY || !TREASURY_WALLET || !OWNER_WALLET) {
        throw new Error("Missing required environment variables. Please run:");
        console.log("export KEEPER_BOT_PUBKEY=$(solana-keygen pubkey ~/.config/solana/keeper-bot-test.json)");
        console.log("export TREASURY_WALLET=$(solana-keygen pubkey ~/.config/solana/treasury-test.json)");
        console.log("export OWNER_WALLET=$(solana-keygen pubkey ~/.config/solana/owner-test.json)");
    }
    
    console.log("\nConfiguration:");
    console.log("Keeper Bot:", KEEPER_BOT_PUBKEY);
    console.log("Treasury:", TREASURY_WALLET);
    console.log("Owner:", OWNER_WALLET);
    console.log("Absolute Vault:", ABSOLUTE_VAULT_PROGRAM_ID);
    console.log("Smart Dial:", SMART_DIAL_PROGRAM_ID);
    
    // Note: Actual initialization would require building proper instruction data
    // For now, we'll save the configuration for manual initialization
    
    const initInfo = {
        network: "devnet",
        programs: {
            absoluteVault: ABSOLUTE_VAULT_PROGRAM_ID,
            smartDial: SMART_DIAL_PROGRAM_ID,
        },
        wallets: {
            keeperBot: KEEPER_BOT_PUBKEY,
            treasury: TREASURY_WALLET,
            owner: OWNER_WALLET,
        },
        aiAgentTwitterId: "1807336107638001665", // @mikolovescrypto
        timestamp: new Date().toISOString(),
    };
    
    const outputPath = path.join(__dirname, "..", "program-init-config.json");
    fs.writeFileSync(outputPath, JSON.stringify(initInfo, null, 2));
    
    console.log("\n✅ Configuration saved to:", outputPath);
    console.log("\nNext steps:");
    console.log("1. Use Anchor client or web interface to initialize programs");
    console.log("2. Create MIKO token with 5% transfer fee");
    console.log("3. Configure and start keeper bot");
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});