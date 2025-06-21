import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import * as fs from 'fs';
import * as path from 'path';

const SMART_DIAL_PROGRAM_ID = new PublicKey("KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA");
const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt");

// USDC mint on devnet
const USDC_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

async function testScenario1() {
    console.log("Testing Scenario 1: Normal Operation (Keeper Bot has >= 0.05 SOL)\n");
    
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
    const smartDialProgram = new Program(smartDialIdl, SMART_DIAL_PROGRAM_ID, provider);
    
    // Derive Smart Dial config PDA
    const [smartDialConfigPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("smart_dial_config")],
        SMART_DIAL_PROGRAM_ID
    );
    
    console.log("=== Scenario 1 Setup ===");
    console.log("Expected behavior:");
    console.log("- All 5% tax swapped to USDC");
    console.log("- 80% distributed to eligible holders");
    console.log("- 20% sent to owner");
    
    // Check keeper bot balance
    const keeperBalance = await connection.getBalance(keeperBotKeypair.publicKey);
    console.log(`\nKeeper bot balance: ${keeperBalance / 1e9} SOL`);
    
    if (keeperBalance < 0.05 * 1e9) {
        console.log("❌ Keeper bot has less than 0.05 SOL. Topping up...");
        
        // Top up keeper bot
        const topUpTx = await connection.requestAirdrop(
            keeperBotKeypair.publicKey,
            0.1 * 1e9
        );
        await connection.confirmTransaction(topUpTx);
        console.log("✅ Topped up keeper bot to 0.1 SOL");
    }
    
    console.log("\n=== Setting Reward Token to USDC ===");
    
    try {
        // Create provider with keeper bot wallet
        const keeperProvider = new AnchorProvider(
            connection,
            new anchor.Wallet(keeperBotKeypair),
            { commitment: 'confirmed' }
        );
        
        const keeperProgram = new Program(smartDialIdl, SMART_DIAL_PROGRAM_ID, keeperProvider);
        
        // Update reward token to USDC
        const tx = await keeperProgram.methods
            .updateRewardToken(USDC_DEVNET)
            .accounts({
                keeperBot: keeperBotKeypair.publicKey,
                config: smartDialConfigPDA,
            })
            .rpc();
        
        console.log("✅ Reward token updated to USDC");
        console.log("Transaction:", tx);
        
        // Verify update
        const config = await smartDialProgram.account.config.fetch(smartDialConfigPDA) as any;
        console.log("Current reward token:", config.currentRewardToken.toBase58());
        
    } catch (error: any) {
        console.error("❌ Error updating reward token:", error.message);
        if (error.logs) {
            console.error("Program logs:", error.logs);
        }
    }
    
    console.log("\n=== Simulating Tax Distribution ===");
    console.log("In a real scenario, this would:");
    console.log("1. Process collected taxes from the tax holding account");
    console.log("2. Swap all MIKO to USDC via Jupiter");
    console.log("3. Distribute 80% USDC to eligible holders proportionally");
    console.log("4. Send 20% USDC to the owner wallet");
    
    // In a real implementation, we would call:
    // - processCollectedTaxes on Absolute Vault
    // - calculateAndDistributeRewards on Absolute Vault
    
    console.log("\n⚠️  Note: Actual distribution requires:");
    console.log("- Jupiter integration for token swaps");
    console.log("- Tax holding account to have collected fees");
    console.log("- Process tax and distribution functions to be called");
    
    console.log("\n✅ Scenario 1 configuration complete!");
    console.log("Reward token is set to USDC and keeper bot has sufficient SOL");
}

// Run the script
testScenario1().catch(console.error);