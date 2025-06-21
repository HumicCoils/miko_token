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
    createTransferCheckedInstruction,
    getAccount,
    getTransferFeeAmount,
    unpackAccount,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

// Load token configuration
const tokenConfigPath = path.join(__dirname, '..', 'config', 'miko-token.json');
const tokenConfig = JSON.parse(fs.readFileSync(tokenConfigPath, 'utf-8'));

const MIKO_TOKEN_MINT = new PublicKey(tokenConfig.mint);
const DECIMALS = tokenConfig.decimals;
const TAX_HOLDING_PDA = new PublicKey(tokenConfig.taxHoldingPda);

// Test scenarios
const TEST_TRANSFERS = [
    {
        from: 'test-holder-1.json',
        to: 'test-holder-2.json',
        amount: 1_000_000, // 1M tokens
        description: 'Transfer 1M tokens from Holder 1 to Holder 2 (should incur 5% tax)'
    },
    {
        from: 'test-holder-3.json',
        to: 'test-holder-1.json',
        amount: 500_000, // 500K tokens
        description: 'Transfer 500K tokens from Holder 3 to Holder 1 (should incur 5% tax)'
    },
    {
        from: 'treasury-wallet.json',
        to: 'test-holder-1.json',
        amount: 100_000, // 100K tokens
        description: 'Transfer 100K tokens from Treasury to Holder 1 (should be tax exempt)'
    }
];

async function testTaxCollection() {
    console.log("Testing MIKO token tax collection...\n");
    
    // Setup connection
    const connection = new Connection("https://api.devnet.solana.com", 'confirmed');
    
    // Load deployer for paying transaction fees
    const deployerPath = path.join(process.env.HOME!, '.config/solana/deployer-test.json');
    const deployerKeypair = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(deployerPath, 'utf-8')))
    );
    
    console.log("Fee payer:", deployerKeypair.publicKey.toBase58());
    console.log("Token mint:", MIKO_TOKEN_MINT.toBase58());
    console.log("Tax holding PDA:", TAX_HOLDING_PDA.toBase58());
    console.log("Transfer fee: 5%\n");
    
    // Get initial balances
    console.log("=== Initial Balances ===");
    const initialBalances: Map<string, number> = new Map();
    
    // Check all test wallet balances
    const walletsToCheck = ['test-holder-1.json', 'test-holder-2.json', 'test-holder-3.json', 'treasury-wallet.json'];
    
    for (const walletFile of walletsToCheck) {
        const wallet = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(walletFile, 'utf-8')))
        );
        
        const tokenAccount = await getAssociatedTokenAddress(
            MIKO_TOKEN_MINT,
            wallet.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID
        );
        
        try {
            const account = await getAccount(
                connection,
                tokenAccount,
                'confirmed',
                TOKEN_2022_PROGRAM_ID
            );
            
            const balance = Number(account.amount) / (10 ** DECIMALS);
            initialBalances.set(walletFile, balance);
            console.log(`${walletFile}: ${balance.toLocaleString()} MIKO`);
        } catch (e) {
            initialBalances.set(walletFile, 0);
            console.log(`${walletFile}: 0 MIKO`);
        }
    }
    
    // Check tax holding account
    const taxHoldingAccount = await getAssociatedTokenAddress(
        MIKO_TOKEN_MINT,
        TAX_HOLDING_PDA,
        true, // allowOwnerOffCurve
        TOKEN_2022_PROGRAM_ID
    );
    
    let initialTaxHolding = 0;
    try {
        const taxAccount = await connection.getAccountInfo(taxHoldingAccount);
        if (taxAccount) {
            const unpacked = unpackAccount(taxAccount.data, taxAccount.owner);
            initialTaxHolding = Number(unpacked.amount) / (10 ** DECIMALS);
        }
    } catch (e) {
        // Account might not exist yet
    }
    
    console.log(`\nTax holding account: ${initialTaxHolding.toLocaleString()} MIKO`);
    
    // Perform test transfers
    console.log("\n=== Performing Test Transfers ===");
    
    for (const transfer of TEST_TRANSFERS) {
        console.log(`\n${transfer.description}`);
        
        try {
            // Load sender wallet
            const senderKeypair = Keypair.fromSecretKey(
                new Uint8Array(JSON.parse(fs.readFileSync(transfer.from, 'utf-8')))
            );
            
            // Load recipient wallet
            const recipientKeypair = Keypair.fromSecretKey(
                new Uint8Array(JSON.parse(fs.readFileSync(transfer.to, 'utf-8')))
            );
            
            console.log(`From: ${senderKeypair.publicKey.toBase58()}`);
            console.log(`To: ${recipientKeypair.publicKey.toBase58()}`);
            console.log(`Amount: ${transfer.amount.toLocaleString()} MIKO`);
            
            // Get token accounts
            const senderTokenAccount = await getAssociatedTokenAddress(
                MIKO_TOKEN_MINT,
                senderKeypair.publicKey,
                false,
                TOKEN_2022_PROGRAM_ID
            );
            
            const recipientTokenAccount = await getAssociatedTokenAddress(
                MIKO_TOKEN_MINT,
                recipientKeypair.publicKey,
                false,
                TOKEN_2022_PROGRAM_ID
            );
            
            // Create transfer instruction
            const transferInstruction = createTransferCheckedInstruction(
                senderTokenAccount,
                MIKO_TOKEN_MINT,
                recipientTokenAccount,
                senderKeypair.publicKey,
                BigInt(transfer.amount) * BigInt(10 ** DECIMALS),
                DECIMALS,
                [],
                TOKEN_2022_PROGRAM_ID
            );
            
            // Send transaction
            const transaction = new Transaction().add(transferInstruction);
            
            const signature = await sendAndConfirmTransaction(
                connection,
                transaction,
                [deployerKeypair, senderKeypair], // deployer pays fees, sender signs transfer
                { commitment: 'confirmed' }
            );
            
            console.log(`✅ Transfer successful!`);
            console.log(`Transaction: ${signature}`);
            
            // Calculate expected amounts
            const isTaxExempt = transfer.from === 'treasury-wallet.json';
            const expectedFee = isTaxExempt ? 0 : transfer.amount * 0.05;
            const expectedReceived = transfer.amount - expectedFee;
            
            console.log(`Expected fee: ${expectedFee.toLocaleString()} MIKO (${isTaxExempt ? 'tax exempt' : '5%'})`);
            console.log(`Expected received: ${expectedReceived.toLocaleString()} MIKO`);
            
        } catch (error: any) {
            console.error(`❌ Error:`, error.message);
            if (error.logs) {
                console.error("Program logs:", error.logs);
            }
        }
    }
    
    // Check final balances
    console.log("\n=== Final Balances ===");
    
    for (const walletFile of walletsToCheck) {
        const wallet = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(walletFile, 'utf-8')))
        );
        
        const tokenAccount = await getAssociatedTokenAddress(
            MIKO_TOKEN_MINT,
            wallet.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID
        );
        
        try {
            const account = await getAccount(
                connection,
                tokenAccount,
                'confirmed',
                TOKEN_2022_PROGRAM_ID
            );
            
            const balance = Number(account.amount) / (10 ** DECIMALS);
            const initial = initialBalances.get(walletFile) || 0;
            const change = balance - initial;
            
            console.log(`${walletFile}: ${balance.toLocaleString()} MIKO (${change >= 0 ? '+' : ''}${change.toLocaleString()})`);
        } catch (e) {
            console.log(`${walletFile}: 0 MIKO`);
        }
    }
    
    // Check tax holding account final balance
    let finalTaxHolding = 0;
    try {
        const taxAccount = await connection.getAccountInfo(taxHoldingAccount);
        if (taxAccount) {
            const unpacked = unpackAccount(taxAccount.data, taxAccount.owner);
            finalTaxHolding = Number(unpacked.amount) / (10 ** DECIMALS);
        }
    } catch (e) {
        // Account might not exist
    }
    
    const taxCollected = finalTaxHolding - initialTaxHolding;
    console.log(`\nTax holding account: ${finalTaxHolding.toLocaleString()} MIKO (+${taxCollected.toLocaleString()})`);
    
    // Summary
    console.log("\n========================================");
    console.log("✅ TAX COLLECTION TEST COMPLETE!");
    console.log("========================================");
    console.log(`Total tax collected: ${taxCollected.toLocaleString()} MIKO`);
    console.log(`Treasury transfers were ${taxCollected === 0 ? 'correctly' : 'incorrectly'} tax exempt`);
    
    // Calculate expected vs actual
    const expectedTax = (1_000_000 * 0.05) + (500_000 * 0.05); // 50K + 25K = 75K
    console.log(`Expected tax from non-exempt transfers: ${expectedTax.toLocaleString()} MIKO`);
    
    if (Math.abs(taxCollected - expectedTax) < 1) {
        console.log("✅ Tax collection working correctly!");
    } else {
        console.log("❌ Tax collection mismatch!");
    }
}

// Run the script
testTaxCollection().catch(console.error);