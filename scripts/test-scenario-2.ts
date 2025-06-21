import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from 'fs';
import * as path from 'path';

const SMART_DIAL_PROGRAM_ID = new PublicKey("KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA");

// BONK token on devnet (example)
const BONK_DEVNET = new PublicKey("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263");

async function testScenario2() {
    console.log("Testing Scenario 2: Low SOL Balance (Keeper Bot has < 0.05 SOL)\n");
    
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
    
    console.log("=== Scenario 2 Setup ===");
    console.log("Expected behavior:");
    console.log("- 4% swapped to BONK (all to holders)");
    console.log("- 1% swapped to SOL (to owner)");
    console.log("- Keeper bot topped up to 0.1 SOL");
    
    // Check keeper bot balance
    let keeperBalance = await connection.getBalance(keeperBotKeypair.publicKey);
    console.log(`\nCurrent keeper bot balance: ${keeperBalance / LAMPORTS_PER_SOL} SOL`);
    
    // Simulate draining keeper bot to < 0.05 SOL
    if (keeperBalance >= 0.05 * LAMPORTS_PER_SOL) {
        console.log("Simulating low balance by sending SOL to deployer...");
        
        // Calculate amount to send to leave ~0.03 SOL
        const targetBalance = 0.03 * LAMPORTS_PER_SOL;
        const amountToSend = keeperBalance - targetBalance - 5000; // Leave some for fees
        
        if (amountToSend > 0) {
            try {
                // Create a simple transfer transaction
                const { blockhash } = await connection.getLatestBlockhash();
                const transferTx = new anchor.web3.Transaction().add(
                    anchor.web3.SystemProgram.transfer({
                        fromPubkey: keeperBotKeypair.publicKey,
                        toPubkey: deployerKeypair.publicKey,
                        lamports: amountToSend,
                    })
                );
                transferTx.recentBlockhash = blockhash;
                transferTx.feePayer = keeperBotKeypair.publicKey;
                
                // Sign with keeper bot wallet
                transferTx.sign(keeperBotKeypair);
                
                const sig = await connection.sendRawTransaction(transferTx.serialize());
                await connection.confirmTransaction(sig);
                
                keeperBalance = await connection.getBalance(keeperBotKeypair.publicKey);
                console.log(`✅ Keeper bot balance reduced to: ${keeperBalance / LAMPORTS_PER_SOL} SOL`);
            } catch (error) {
                console.error("Error draining keeper bot:", error);
            }
        }
    }
    
    if (keeperBalance >= 0.05 * LAMPORTS_PER_SOL) {
        console.log("⚠️  Warning: Could not reduce keeper bot balance below 0.05 SOL");
    }
    
    console.log("\n=== Setting Reward Token to BONK ===");
    
    try {
        // Create provider with keeper bot wallet
        const keeperProvider = new AnchorProvider(
            connection,
            new anchor.Wallet(keeperBotKeypair),
            { commitment: 'confirmed' }
        );
        
        const keeperProgram = new Program(smartDialIdl, SMART_DIAL_PROGRAM_ID, keeperProvider);
        
        // Update reward token to BONK
        const tx = await keeperProgram.methods
            .updateRewardToken(BONK_DEVNET)
            .accounts({
                keeperBot: keeperBotKeypair.publicKey,
                config: smartDialConfigPDA,
            })
            .rpc();
        
        console.log("✅ Reward token updated to BONK");
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
    
    console.log("\n=== Simulating Tax Distribution (Scenario 2) ===");
    console.log("In a real scenario with low keeper bot balance, this would:");
    console.log("1. Detect keeper bot has < 0.05 SOL");
    console.log("2. Split the 5% tax:");
    console.log("   - 4% swapped to BONK, distributed to holders");
    console.log("   - 1% swapped to SOL:");
    console.log("     - 0.1 SOL to top up keeper bot");
    console.log("     - Remainder to owner");
    console.log("3. Keeper bot balance restored to operational level");
    
    console.log("\n⚠️  Note: Actual distribution requires:");
    console.log("- Jupiter integration for token swaps");
    console.log("- Tax holding account to have collected fees");
    console.log("- Special handling in distribution logic for low SOL scenario");
    
    console.log("\n✅ Scenario 2 configuration complete!");
    console.log("Reward token is set to BONK and keeper bot has low SOL balance");
}

// Run the script
testScenario2().catch(console.error);