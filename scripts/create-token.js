const {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
    ExtensionType,
    TOKEN_2022_PROGRAM_ID,
    createInitializeMintInstruction,
    getMintLen,
    createInitializeTransferFeeConfigInstruction,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    AuthorityType,
    createSetAuthorityInstruction,
    createMintToInstruction,
} = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Constants
const TOTAL_SUPPLY = 1_000_000_000; // 1 billion tokens
const DECIMALS = 9;
const TRANSFER_FEE_BASIS_POINTS = 500; // 5% = 500 basis points
const MAX_FEE = BigInt("18446744073709551615"); // u64::MAX

async function createMikoToken(config) {
    const {
        connection,
        payer,
        mintAuthority,
        freezeAuthority,
        transferFeeAuthority,
        withdrawWithheldAuthority,
    } = config;

    // Generate new mint keypair
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;

    console.log("Creating MIKO token with the following configuration:");
    console.log("Mint address:", mint.toBase58());
    console.log("Decimals:", DECIMALS);
    console.log("Total supply:", TOTAL_SUPPLY.toLocaleString());
    console.log("Transfer fee:", TRANSFER_FEE_BASIS_POINTS / 100, "%");

    // Calculate the required space for the mint account with extensions
    const extensions = [ExtensionType.TransferFeeConfig];
    const mintLen = getMintLen(extensions);

    // Calculate minimum lamports for rent exemption
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    // Create mint account
    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mint,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    // Initialize transfer fee config
    const initializeTransferFeeInstruction = createInitializeTransferFeeConfigInstruction(
        mint,
        transferFeeAuthority,
        withdrawWithheldAuthority,
        TRANSFER_FEE_BASIS_POINTS,
        MAX_FEE,
        TOKEN_2022_PROGRAM_ID
    );

    // Initialize mint
    const initializeMintInstruction = createInitializeMintInstruction(
        mint,
        DECIMALS,
        mintAuthority,
        freezeAuthority,
        TOKEN_2022_PROGRAM_ID
    );

    // Create and send transaction
    const transaction = new Transaction().add(
        createAccountInstruction,
        initializeTransferFeeInstruction,
        initializeMintInstruction
    );

    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payer, mintKeypair],
        {
            commitment: 'confirmed',
        }
    );

    console.log("Token created successfully!");
    console.log("Transaction signature:", signature);

    // Save mint address to file for later use
    const configPath = path.join(__dirname, '..', 'miko-token-config.json');
    fs.writeFileSync(
        configPath,
        JSON.stringify({
            mint: mint.toBase58(),
            decimals: DECIMALS,
            totalSupply: TOTAL_SUPPLY,
            transferFeeBasisPoints: TRANSFER_FEE_BASIS_POINTS,
            createdAt: new Date().toISOString(),
        }, null, 2)
    );

    return mint;
}

// Function to mint initial supply
async function mintInitialSupply(
    connection,
    payer,
    mint,
    mintAuthority,
    recipient,
    amount
) {
    // Get or create associated token account
    const recipientTokenAccount = await getAssociatedTokenAddress(
        mint,
        recipient,
        false,
        TOKEN_2022_PROGRAM_ID
    );

    // Check if account exists
    const accountInfo = await connection.getAccountInfo(recipientTokenAccount);
    
    const transaction = new Transaction();
    
    if (!accountInfo) {
        // Create associated token account if it doesn't exist
        transaction.add(
            createAssociatedTokenAccountInstruction(
                payer.publicKey,
                recipientTokenAccount,
                recipient,
                mint,
                TOKEN_2022_PROGRAM_ID
            )
        );
    }

    // Add mint instruction
    transaction.add(
        createMintToInstruction(
            mint,
            recipientTokenAccount,
            mintAuthority.publicKey,
            amount * Math.pow(10, DECIMALS),
            [],
            TOKEN_2022_PROGRAM_ID
        )
    );

    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payer, mintAuthority],
        {
            commitment: 'confirmed',
        }
    );

    console.log(`Minted ${amount.toLocaleString()} tokens to ${recipient.toBase58()}`);
    console.log("Transaction signature:", signature);

    return signature;
}

// Function to transfer mint authority to null (burn authority)
async function burnMintAuthority(
    connection,
    payer,
    mint,
    currentAuthority
) {
    const transaction = new Transaction().add(
        createSetAuthorityInstruction(
            mint,
            currentAuthority.publicKey,
            AuthorityType.MintTokens,
            null,
            [],
            TOKEN_2022_PROGRAM_ID
        )
    );

    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payer, currentAuthority],
        {
            commitment: 'confirmed',
        }
    );

    console.log("Mint authority burned successfully!");
    console.log("Transaction signature:", signature);

    return signature;
}

// Main script execution
async function main() {
    try {
        // Load configuration
        const RPC_URL = "https://solana-devnet.g.alchemy.com/v2/2jGjgPNpf7uX1gGZVT9Lp8uF_elh2PL5";
        const connection = new Connection(RPC_URL, 'confirmed');
        console.log("Connected to:", RPC_URL);

        // Load payer keypair (deployer)
        const payerPath = path.join(os.homedir(), '.config/solana/deployer-test.json');
        const payerKeypair = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(payerPath, 'utf-8')))
        );
        console.log("Payer:", payerKeypair.publicKey.toBase58());

        // For initial deployment, mint authority is the deployer
        // This will be burned after initial distribution
        const mintAuthority = payerKeypair;

        // Load Absolute Vault tax authority PDA
        const absoluteVaultProgram = new PublicKey("838Ra5u255By2HkV7mtzP6KFgXnjrQiQDB3Gmdpbrf2d");
        
        const [taxAuthorityPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("tax_authority")],
            absoluteVaultProgram
        );
        console.log("Tax Authority PDA:", taxAuthorityPda.toBase58());

        // Get treasury wallet
        const treasuryKeypairPath = path.join(os.homedir(), '.config/solana/treasury-test.json');
        const treasuryKeypair = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(treasuryKeypairPath, 'utf-8')))
        );
        const treasuryWallet = treasuryKeypair.publicKey;
        console.log("Treasury Wallet:", treasuryWallet.toBase58());

        // Create token configuration
        const config = {
            connection,
            payer: payerKeypair,
            mintAuthority: mintAuthority.publicKey,
            freezeAuthority: null, // No freeze authority
            transferFeeAuthority: taxAuthorityPda, // Can update transfer fee
            withdrawWithheldAuthority: taxAuthorityPda, // Can withdraw collected fees
        };

        console.log("\n📝 Creating MIKO Token...");
        // Create the token
        const mint = await createMikoToken(config);

        console.log("\n💰 Minting initial supply...");
        // Mint initial supply to treasury
        await mintInitialSupply(
            connection,
            payerKeypair,
            mint,
            mintAuthority,
            treasuryWallet,
            TOTAL_SUPPLY
        );

        console.log("\n🔥 Burning mint authority...");
        // Burn mint authority to make supply immutable
        await burnMintAuthority(
            connection,
            payerKeypair,
            mint,
            mintAuthority
        );

        console.log("\n✅ MIKO token created successfully!");
        console.log("=".repeat(50));
        console.log("Mint address:", mint.toBase58());
        console.log("Total supply:", TOTAL_SUPPLY.toLocaleString());
        console.log("Transfer fee:", TRANSFER_FEE_BASIS_POINTS / 100, "%");
        console.log("Transfer fee authority:", taxAuthorityPda.toBase58());
        console.log("All authorities properly configured for Absolute Vault program");
        console.log("=".repeat(50));

    } catch (error) {
        console.error("Error creating token:", error);
        process.exit(1);
    }
}

// Run the script
main();