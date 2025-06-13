const { Connection, PublicKey } = require("@solana/web3.js");

// Program IDs
const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("838Ra5u255By2HkV7mtzP6KFgXnjrQiQDB3Gmdpbrf2d");
const SMART_DIAL_PROGRAM_ID = new PublicKey("67sZQtNqoRs5RjncYXMaeRAGrgUK49GSaLJCvHA2SXrj");

async function main() {
    const connection = new Connection("https://solana-devnet.g.alchemy.com/v2/2jGjgPNpf7uX1gGZVT9Lp8uF_elh2PL5", "confirmed");
    
    // Check Smart Dial config
    const [smartDialConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from("smart_dial_config")],
        SMART_DIAL_PROGRAM_ID
    );
    
    console.log("Smart Dial Config PDA:", smartDialConfig.toString());
    const smartDialAccount = await connection.getAccountInfo(smartDialConfig);
    console.log("Smart Dial initialized:", smartDialAccount !== null);
    
    // Check Absolute Vault config
    const [taxConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from("tax_config")],
        ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    console.log("\nAbsolute Vault Tax Config PDA:", taxConfig.toString());
    const taxConfigAccount = await connection.getAccountInfo(taxConfig);
    console.log("Absolute Vault initialized:", taxConfigAccount !== null);
    
    // Check program accounts
    console.log("\nProgram Accounts:");
    console.log("Smart Dial Program:", SMART_DIAL_PROGRAM_ID.toString());
    const smartDialProgramAccount = await connection.getAccountInfo(SMART_DIAL_PROGRAM_ID);
    console.log("Smart Dial program exists:", smartDialProgramAccount !== null);
    
    console.log("\nAbsolute Vault Program:", ABSOLUTE_VAULT_PROGRAM_ID.toString());
    const absoluteVaultProgramAccount = await connection.getAccountInfo(ABSOLUTE_VAULT_PROGRAM_ID);
    console.log("Absolute Vault program exists:", absoluteVaultProgramAccount !== null);
}

main().catch(console.error);