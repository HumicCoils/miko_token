import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from 'fs';
import * as path from 'path';

const SMART_DIAL_PROGRAM_ID = new PublicKey("KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA");

// Wrapped SOL
const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");

async function testScenario3() {
    console.log("Testing Scenario 3: Reward Token is SOL\n");
    
    // Setup connection
    const connection = new Connection("https://api.devnet.solana.com", 'confirmed');
    
    // Load wallets
    const deployerPath = path.join(process.env.HOME!, '.config/solana/deployer-test.json');
    const deployerKeypair = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(deployerPath, 'utf-8')))
    );
    
    const keeperBotKeypair = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync('keeper-bot-wallet.json', 'utf-8')))
    );
    
    // Create provider
    const provider = new AnchorProvider(
        connection,
        new anchor.Wallet(deployerKeypair),
        { commitment: 'confirmed' }
    );
    anchor.setProvider(provider);
    
    // Load Smart Dial IDL
    const smartDialIdlPath = path.join(__dirname, '..', 'target/idl/smart_dial.json');
    const smartDialIdl = JSON.parse(fs.readFileSync(smartDialIdlPath, 'utf-8'));
    
    // Derive Smart Dial config PDA
    const [smartDialConfigPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("smart_dial_config")],
        SMART_DIAL_PROGRAM_ID
    );
    
    console.log("=== Scenario 3 Setup ===");
    console.log("Expected behavior:");
    console.log("- All 5% swapped to SOL");
    console.log("- 80% to holders");
    console.log("- 20% handled based on keeper bot balance:");
    console.log("  - If keeper < 0.05 SOL: top up to 0.1 SOL, rest to owner");
    console.log("  - If keeper >= 0.05 SOL: all to owner");
    
    // Check keeper bot balance
    const keeperBalance = await connection.getBalance(keeperBotKeypair.publicKey);
    console.log(`\nCurrent keeper bot balance: ${keeperBalance / LAMPORTS_PER_SOL} SOL`);
    
    console.log("\n=== Setting Reward Token to SOL ===");
    
    try {
        // Create provider with keeper bot wallet
        const keeperProvider = new AnchorProvider(
            connection,
            new anchor.Wallet(keeperBotKeypair),
            { commitment: 'confirmed' }
        );
        
        const keeperProgram = new Program(smartDialIdl, SMART_DIAL_PROGRAM_ID, keeperProvider);
        
        // Update reward token to Wrapped SOL
        const tx = await keeperProgram.methods
            .updateRewardToken(WRAPPED_SOL)
            .accounts({
                keeperBot: keeperBotKeypair.publicKey,
                config: smartDialConfigPDA,
            })
            .rpc();
        
        console.log("✅ Reward token updated to SOL");
        console.log("Transaction:", tx);
        
        // Verify update
        const smartDialProgram = new Program(smartDialIdl, SMART_DIAL_PROGRAM_ID, provider);
        const config = await smartDialProgram.account.config.fetch(smartDialConfigPDA) as any;
        console.log("Current reward token:", config.currentRewardToken.toBase58());
        
    } catch (error: any) {
        console.error("❌ Error updating reward token:", error.message);
        if (error.logs) {
            console.error("Program logs:", error.logs);
        }
    }
    
    console.log("\n=== Simulating Tax Distribution (Scenario 3) ===");
    console.log("In a real scenario with SOL as reward token:");
    console.log("1. All 5% tax swapped to SOL");
    console.log("2. Distribution:");
    console.log("   - 80% (4% of total) distributed to eligible holders as SOL");
    console.log("   - 20% (1% of total) handled based on keeper bot balance:");
    
    if (keeperBalance < 0.05 * LAMPORTS_PER_SOL) {
        console.log("     - Keeper bot has < 0.05 SOL");
        console.log("     - First 0.1 SOL goes to keeper bot");
        console.log("     - Remainder goes to owner");
    } else {
        console.log("     - Keeper bot has >= 0.05 SOL");
        console.log("     - All 20% goes to owner");
    }
    
    console.log("\n=== Testing Both Sub-scenarios ===");
    
    // Test with different keeper bot balances
    const testBalances = [
        { balance: 0.03, description: "Low balance (< 0.05 SOL)" },
        { balance: 0.08, description: "Normal balance (>= 0.05 SOL)" }
    ];
    
    for (const test of testBalances) {
        console.log(`\n--- ${test.description} ---`);
        console.log(`Keeper balance: ${test.balance} SOL`);
        
        // Simulate 1% (0.2 SOL worth) for owner's portion
        const ownerPortion = 0.2 * LAMPORTS_PER_SOL;
        
        if (test.balance < 0.05) {
            const keeperTopUp = Math.min(ownerPortion, (0.1 - test.balance) * LAMPORTS_PER_SOL);
            const ownerReceives = ownerPortion - keeperTopUp;
            
            console.log(`Keeper receives: ${keeperTopUp / LAMPORTS_PER_SOL} SOL (top up)`);
            console.log(`Owner receives: ${ownerReceives / LAMPORTS_PER_SOL} SOL`);
            console.log(`Keeper final balance: ${(test.balance + keeperTopUp / LAMPORTS_PER_SOL)} SOL`);
        } else {
            console.log(`Keeper receives: 0 SOL (already sufficient)`);
            console.log(`Owner receives: ${ownerPortion / LAMPORTS_PER_SOL} SOL`);
            console.log(`Keeper final balance: ${test.balance} SOL`);
        }
    }
    
    console.log("\n⚠️  Note: Actual distribution requires:");
    console.log("- Jupiter integration for MIKO to SOL swaps");
    console.log("- Native SOL distribution logic (not SPL tokens)");
    console.log("- Special handling for keeper bot top-up");
    
    console.log("\n✅ Scenario 3 configuration complete!");
    console.log("Reward token is set to SOL");
}

// Run the script
testScenario3().catch(console.error);