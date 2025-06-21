import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
    TOKEN_2022_PROGRAM_ID,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createTransferCheckedInstruction,
    getAccount,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

// Load token configuration
const tokenConfigPath = path.join(__dirname, '..', 'config', 'miko-token.json');
const tokenConfig = JSON.parse(fs.readFileSync(tokenConfigPath, 'utf-8'));

const MIKO_TOKEN_MINT = new PublicKey(tokenConfig.mint);
const DECIMALS = tokenConfig.decimals;

// Distribution amounts
const DISTRIBUTIONS = [
    { wallet: 'test-holder-1.json', amount: 10_000_000, description: 'Holder 1: 10M tokens (above $100 threshold)' },
    { wallet: 'test-holder-2.json', amount: 500_000, description: 'Holder 2: 500K tokens (below $100 threshold)' },
    { wallet: 'test-holder-3.json', amount: 5_000_000, description: 'Holder 3: 5M tokens (above $100 threshold)' },
];

async function distributeTestTokens() {
    console.log("Distributing MIKO tokens to test wallets...\n");
    
    // Setup connection
    const connection = new Connection("https://api.devnet.solana.com", 'confirmed');
    
    // Load treasury wallet (sender)
    const treasuryKeypair = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync('treasury-wallet.json', 'utf-8')))
    );
    
    // Load deployer for paying transaction fees
    const deployerPath = path.join(process.env.HOME!, '.config/solana/deployer-test.json');
    const deployerKeypair = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(deployerPath, 'utf-8')))
    );
    
    console.log("Treasury wallet:", treasuryKeypair.publicKey.toBase58());
    console.log("Token mint:", MIKO_TOKEN_MINT.toBase58());
    console.log("Fee payer:", deployerKeypair.publicKey.toBase58());
    
    // Get treasury's token account
    const treasuryTokenAccount = await getAssociatedTokenAddress(
        MIKO_TOKEN_MINT,
        treasuryKeypair.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
    );
    
    // Check treasury balance
    try {
        const treasuryAccount = await getAccount(
            connection,
            treasuryTokenAccount,
            'confirmed',
            TOKEN_2022_PROGRAM_ID
        );
        
        const balance = Number(treasuryAccount.amount) / (10 ** DECIMALS);
        console.log(`\nTreasury balance: ${balance.toLocaleString()} MIKO`);
        
        // Calculate total needed
        const totalNeeded = DISTRIBUTIONS.reduce((sum, dist) => sum + dist.amount, 0);
        console.log(`Total to distribute: ${totalNeeded.toLocaleString()} MIKO`);
        
        if (balance < totalNeeded) {
            throw new Error(`Insufficient balance. Need ${totalNeeded.toLocaleString()} MIKO but have ${balance.toLocaleString()} MIKO`);
        }
    } catch (error: any) {
        console.error("Error checking treasury balance:", error.message);
        throw error;
    }
    
    console.log("\nStarting distributions...\n");
    
    // Distribute to each test wallet
    for (const distribution of DISTRIBUTIONS) {
        try {
            console.log(`\n${distribution.description}`);
            
            // Load recipient wallet
            const recipientKeypair = Keypair.fromSecretKey(
                new Uint8Array(JSON.parse(fs.readFileSync(distribution.wallet, 'utf-8')))
            );
            
            console.log(`Recipient: ${recipientKeypair.publicKey.toBase58()}`);
            console.log(`Amount: ${distribution.amount.toLocaleString()} MIKO`);
            
            // Get or create recipient's token account
            const recipientTokenAccount = await getAssociatedTokenAddress(
                MIKO_TOKEN_MINT,
                recipientKeypair.publicKey,
                false,
                TOKEN_2022_PROGRAM_ID
            );
            
            // Check if account exists
            const recipientAccountInfo = await connection.getAccountInfo(recipientTokenAccount);
            
            const transaction = new Transaction();
            
            if (!recipientAccountInfo) {
                console.log("Creating associated token account...");
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        deployerKeypair.publicKey, // payer
                        recipientTokenAccount,
                        recipientKeypair.publicKey, // owner
                        MIKO_TOKEN_MINT,
                        TOKEN_2022_PROGRAM_ID
                    )
                );
            }
            
            // Add transfer instruction
            transaction.add(
                createTransferCheckedInstruction(
                    treasuryTokenAccount, // source
                    MIKO_TOKEN_MINT,
                    recipientTokenAccount, // destination
                    treasuryKeypair.publicKey, // owner
                    BigInt(distribution.amount) * BigInt(10 ** DECIMALS),
                    DECIMALS,
                    [],
                    TOKEN_2022_PROGRAM_ID
                )
            );
            
            // Send transaction
            const signature = await sendAndConfirmTransaction(
                connection,
                transaction,
                [deployerKeypair, treasuryKeypair], // deployer pays fees, treasury signs transfer
                { commitment: 'confirmed' }
            );
            
            console.log(`✅ Transfer successful!`);
            console.log(`Transaction: ${signature}`);
            
            // Check recipient balance
            const recipientAccount = await getAccount(
                connection,
                recipientTokenAccount,
                'confirmed',
                TOKEN_2022_PROGRAM_ID
            );
            
            const newBalance = Number(recipientAccount.amount) / (10 ** DECIMALS);
            console.log(`New balance: ${newBalance.toLocaleString()} MIKO`);
            
            // Note about transfer fee
            const expectedAfterFee = distribution.amount * 0.95; // 5% fee
            console.log(`Expected after 5% fee: ${expectedAfterFee.toLocaleString()} MIKO`);
            
        } catch (error: any) {
            console.error(`\n❌ Error distributing to ${distribution.wallet}:`, error.message);
            if (error.logs) {
                console.error("Program logs:", error.logs);
            }
            throw error;
        }
    }
    
    // Final summary
    console.log("\n========================================");
    console.log("✅ TOKEN DISTRIBUTION COMPLETE!");
    console.log("========================================");
    
    // Check final balances
    console.log("\nFinal balances:");
    
    for (const distribution of DISTRIBUTIONS) {
        const recipientKeypair = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(distribution.wallet, 'utf-8')))
        );
        
        const recipientTokenAccount = await getAssociatedTokenAddress(
            MIKO_TOKEN_MINT,
            recipientKeypair.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID
        );
        
        try {
            const account = await getAccount(
                connection,
                recipientTokenAccount,
                'confirmed',
                TOKEN_2022_PROGRAM_ID
            );
            
            const balance = Number(account.amount) / (10 ** DECIMALS);
            console.log(`${distribution.wallet}: ${balance.toLocaleString()} MIKO`);
        } catch (e) {
            console.log(`${distribution.wallet}: 0 MIKO (account not found)`);
        }
    }
    
    // Check treasury balance after distributions
    const treasuryAccountAfter = await getAccount(
        connection,
        treasuryTokenAccount,
        'confirmed',
        TOKEN_2022_PROGRAM_ID
    );
    
    const treasuryBalanceAfter = Number(treasuryAccountAfter.amount) / (10 ** DECIMALS);
    console.log(`\nTreasury remaining: ${treasuryBalanceAfter.toLocaleString()} MIKO`);
}

// Run the script
distributeTestTokens().catch(console.error);