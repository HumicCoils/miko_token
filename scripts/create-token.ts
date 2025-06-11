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
    mintTo,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
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

interface CreateTokenConfig {
    connection: Connection;
    payer: Keypair;
    mintAuthority: PublicKey;
    freezeAuthority: PublicKey | null;
    transferFeeAuthority: PublicKey;
    withdrawWithheldAuthority: PublicKey;
}

export async function createMikoToken(config: CreateTokenConfig): Promise<PublicKey> {
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
    console.log("Total supply:", TOTAL_SUPPLY);
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
    const configPath = path.join(__dirname, '..', 'config', 'mint.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
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
export async function mintInitialSupply(
    connection: Connection,
    payer: Keypair,
    mint: PublicKey,
    mintAuthority: Keypair,
    recipient: PublicKey,
    amount: number
): Promise<string> {
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
            amount * (10 ** DECIMALS),
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

    console.log(`Minted ${amount} tokens to ${recipient.toBase58()}`);
    console.log("Transaction signature:", signature);

    return signature;
}

// Function to transfer mint authority to null (burn authority)
export async function burnMintAuthority(
    connection: Connection,
    payer: Keypair,
    mint: PublicKey,
    currentAuthority: Keypair
): Promise<string> {
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
if (require.main === module) {
    (async () => {
        try {
            // Load configuration from environment or use defaults
            const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
            const connection = new Connection(RPC_URL, 'confirmed');

            // Load payer keypair (deployer)
            const payerPath = process.env.PAYER_KEYPAIR_PATH || 
                path.join(process.env.HOME!, '.config/solana/id.json');
            const payerKeypair = Keypair.fromSecretKey(
                new Uint8Array(JSON.parse(fs.readFileSync(payerPath, 'utf-8')))
            );

            // For initial deployment, mint authority is the deployer
            // This will be burned after initial distribution
            const mintAuthority = payerKeypair;

            // Load Absolute Vault tax authority PDA
            // This should be calculated based on the deployed program
            const absoluteVaultProgram = new PublicKey(
                process.env.ABSOLUTE_VAULT_PROGRAM_ID || "11111111111111111111111111111111"
            );
            
            const [taxAuthorityPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("tax_authority")],
                absoluteVaultProgram
            );

            // Create token configuration
            const config: CreateTokenConfig = {
                connection,
                payer: payerKeypair,
                mintAuthority: mintAuthority.publicKey,
                freezeAuthority: null, // No freeze authority
                transferFeeAuthority: taxAuthorityPda, // Can update transfer fee
                withdrawWithheldAuthority: taxAuthorityPda, // Can withdraw collected fees
            };

            // Create the token
            const mint = await createMikoToken(config);

            // Mint initial supply to treasury (or initial holder)
            const treasuryWallet = new PublicKey(
                process.env.TREASURY_WALLET || payerKeypair.publicKey.toBase58()
            );
            
            await mintInitialSupply(
                connection,
                payerKeypair,
                mint,
                mintAuthority,
                treasuryWallet,
                TOTAL_SUPPLY
            );

            // Burn mint authority to make supply immutable
            await burnMintAuthority(
                connection,
                payerKeypair,
                mint,
                mintAuthority
            );

            console.log("\nMIKO token created successfully!");
            console.log("Mint address:", mint.toBase58());
            console.log("Total supply:", TOTAL_SUPPLY);
            console.log("Transfer fee:", TRANSFER_FEE_BASIS_POINTS / 100, "%");
            console.log("All authorities properly configured for Absolute Vault program");

        } catch (error) {
            console.error("Error creating token:", error);
            process.exit(1);
        }
    })();
}

// Import fix for createMintToInstruction
import { createMintToInstruction } from '@solana/spl-token';