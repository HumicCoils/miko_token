import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
    ExtensionType,
    TOKEN_2022_PROGRAM_ID,
    createInitializeMintInstruction,
    getMintLen,
    createInitializeTransferFeeConfigInstruction,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createMintToInstruction,
    AuthorityType,
    createSetAuthorityInstruction,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

// Constants
const TOTAL_SUPPLY = 1_000_000_000; // 1 billion tokens
const DECIMALS = 9;
const TRANSFER_FEE_BASIS_POINTS = 500; // 5% = 500 basis points
const MAX_FEE = BigInt("18446744073709551615"); // u64::MAX

// Our deployed Absolute Vault program ID
const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt");

async function createMikoToken() {
    console.log("Creating MIKO Token on Devnet...\n");
    
    // Setup connection
    const connection = new Connection("https://api.devnet.solana.com", 'confirmed');
    
    // Load deployer wallet
    const deployerPath = path.join(process.env.HOME!, '.config/solana/deployer-test.json');
    const deployerKeypair = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(deployerPath, 'utf-8')))
    );
    
    // Load treasury wallet
    const treasuryKeypair = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync('treasury-wallet.json', 'utf-8')))
    );
    
    console.log("Deployer:", deployerKeypair.publicKey.toBase58());
    console.log("Treasury:", treasuryKeypair.publicKey.toBase58());
    
    // Check deployer balance
    const balance = await connection.getBalance(deployerKeypair.publicKey);
    console.log("Deployer balance:", balance / 1e9, "SOL");
    
    if (balance < 0.1 * 1e9) {
        throw new Error("Insufficient balance. Need at least 0.1 SOL");
    }
    
    // Derive tax authority PDA from Absolute Vault program
    const [taxAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("tax_authority")],
        ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    const [taxHoldingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("tax_holding")],
        ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    console.log("\nTax Authority PDA:", taxAuthorityPda.toBase58());
    console.log("Tax Holding PDA:", taxHoldingPda.toBase58());
    
    // Generate new mint keypair
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;
    
    console.log("\nCreating MIKO token with the following configuration:");
    console.log("Mint address:", mint.toBase58());
    console.log("Decimals:", DECIMALS);
    console.log("Total supply:", TOTAL_SUPPLY.toLocaleString());
    console.log("Transfer fee:", TRANSFER_FEE_BASIS_POINTS / 100, "%");
    
    try {
        // Calculate the required space for the mint account with extensions
        const extensions = [ExtensionType.TransferFeeConfig];
        const mintLen = getMintLen(extensions);
        
        // Calculate minimum lamports for rent exemption
        const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
        
        // Create mint account
        const createAccountInstruction = SystemProgram.createAccount({
            fromPubkey: deployerKeypair.publicKey,
            newAccountPubkey: mint,
            space: mintLen,
            lamports,
            programId: TOKEN_2022_PROGRAM_ID,
        });
        
        // Initialize transfer fee config
        // Both authorities are set to the tax authority PDA
        const initializeTransferFeeInstruction = createInitializeTransferFeeConfigInstruction(
            mint,
            taxAuthorityPda, // transferFeeConfigAuthority
            taxAuthorityPda, // withdrawWithheldAuthority
            TRANSFER_FEE_BASIS_POINTS,
            MAX_FEE,
            TOKEN_2022_PROGRAM_ID
        );
        
        // Initialize mint
        // Mint authority is temporarily the deployer, will be burned after initial distribution
        const initializeMintInstruction = createInitializeMintInstruction(
            mint,
            DECIMALS,
            deployerKeypair.publicKey, // mintAuthority (temporary)
            null, // freezeAuthority (none)
            TOKEN_2022_PROGRAM_ID
        );
        
        // Create and send transaction
        const createTransaction = new Transaction().add(
            createAccountInstruction,
            initializeTransferFeeInstruction,
            initializeMintInstruction
        );
        
        console.log("\nCreating token mint...");
        const createSignature = await sendAndConfirmTransaction(
            connection,
            createTransaction,
            [deployerKeypair, mintKeypair],
            { commitment: 'confirmed' }
        );
        
        console.log("✅ Token created successfully!");
        console.log("Transaction signature:", createSignature);
        
        // Now mint the total supply to treasury
        console.log("\nMinting total supply to treasury...");
        
        // Get or create treasury's associated token account
        const treasuryTokenAccount = await getAssociatedTokenAddress(
            mint,
            treasuryKeypair.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID
        );
        
        const mintTransaction = new Transaction();
        
        // Create associated token account for treasury
        mintTransaction.add(
            createAssociatedTokenAccountInstruction(
                deployerKeypair.publicKey, // payer
                treasuryTokenAccount,
                treasuryKeypair.publicKey, // owner
                mint,
                TOKEN_2022_PROGRAM_ID
            )
        );
        
        // Mint total supply
        mintTransaction.add(
            createMintToInstruction(
                mint,
                treasuryTokenAccount,
                deployerKeypair.publicKey, // mintAuthority
                BigInt(TOTAL_SUPPLY) * BigInt(10 ** DECIMALS),
                [],
                TOKEN_2022_PROGRAM_ID
            )
        );
        
        const mintSignature = await sendAndConfirmTransaction(
            connection,
            mintTransaction,
            [deployerKeypair],
            { commitment: 'confirmed' }
        );
        
        console.log("✅ Minted", TOTAL_SUPPLY.toLocaleString(), "MIKO tokens to treasury!");
        console.log("Transaction signature:", mintSignature);
        
        // Burn mint authority to make supply immutable
        console.log("\nBurning mint authority...");
        
        const burnAuthorityTransaction = new Transaction().add(
            createSetAuthorityInstruction(
                mint,
                deployerKeypair.publicKey,
                AuthorityType.MintTokens,
                null, // Set to null to burn
                [],
                TOKEN_2022_PROGRAM_ID
            )
        );
        
        const burnSignature = await sendAndConfirmTransaction(
            connection,
            burnAuthorityTransaction,
            [deployerKeypair],
            { commitment: 'confirmed' }
        );
        
        console.log("✅ Mint authority burned successfully!");
        console.log("Transaction signature:", burnSignature);
        
        // Save mint information
        const configDir = path.join(__dirname, '..', 'config');
        fs.mkdirSync(configDir, { recursive: true });
        
        const mintInfo = {
            mint: mint.toBase58(),
            decimals: DECIMALS,
            totalSupply: TOTAL_SUPPLY,
            transferFeeBasisPoints: TRANSFER_FEE_BASIS_POINTS,
            treasuryTokenAccount: treasuryTokenAccount.toBase58(),
            taxAuthorityPda: taxAuthorityPda.toBase58(),
            taxHoldingPda: taxHoldingPda.toBase58(),
            createdAt: new Date().toISOString(),
            network: "devnet"
        };
        
        fs.writeFileSync(
            path.join(configDir, 'miko-token.json'),
            JSON.stringify(mintInfo, null, 2)
        );
        
        console.log("\n========================================");
        console.log("✅ MIKO TOKEN CREATED SUCCESSFULLY!");
        console.log("========================================");
        console.log("Mint address:", mint.toBase58());
        console.log("Total supply:", TOTAL_SUPPLY.toLocaleString(), "MIKO");
        console.log("Transfer fee:", TRANSFER_FEE_BASIS_POINTS / 100, "%");
        console.log("Treasury token account:", treasuryTokenAccount.toBase58());
        console.log("\nToken information saved to: config/miko-token.json");
        console.log("\n⚠️  IMPORTANT: Update the MIKO token mint address in keeper-bot/.env.devnet");
        
    } catch (error: any) {
        console.error("\n❌ Error creating token:", error);
        if (error.logs) {
            console.error("Program logs:", error.logs);
        }
        process.exit(1);
    }
}

// Run the script
createMikoToken().catch(console.error);