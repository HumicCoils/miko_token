const {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
    TOKEN_2022_PROGRAM_ID,
    getMint,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createMintToInstruction,
    AuthorityType,
    createSetAuthorityInstruction,
} = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Constants
const TOTAL_SUPPLY = 1_000_000_000; // 1 billion tokens
const DECIMALS = 9;
const MINT_ADDRESS = "BiQUbqckzG7C4hhv6vCYBeEx7KDEgaXqK1M3x9X67KKh"; // From previous attempt

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

        const mint = new PublicKey(MINT_ADDRESS);
        console.log("Checking token mint:", mint.toBase58());

        // Check mint info
        const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
        console.log("\nMint Info:");
        console.log("- Supply:", mintInfo.supply.toString());
        console.log("- Decimals:", mintInfo.decimals);
        console.log("- Mint Authority:", mintInfo.mintAuthority?.toBase58() || "null");
        console.log("- Freeze Authority:", mintInfo.freezeAuthority?.toBase58() || "null");

        // Get treasury wallet
        const treasuryKeypairPath = path.join(os.homedir(), '.config/solana/treasury-test.json');
        const treasuryKeypair = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(treasuryKeypairPath, 'utf-8')))
        );
        const treasuryWallet = treasuryKeypair.publicKey;
        console.log("\nTreasury Wallet:", treasuryWallet.toBase58());

        // Check if we need to mint
        if (mintInfo.supply.toString() === "0" && mintInfo.mintAuthority) {
            console.log("\n💰 Minting initial supply...");
            
            // Get or create associated token account
            const treasuryTokenAccount = await getAssociatedTokenAddress(
                mint,
                treasuryWallet,
                false,
                TOKEN_2022_PROGRAM_ID
            );

            // Check if account exists
            const accountInfo = await connection.getAccountInfo(treasuryTokenAccount);
            
            const transaction = new Transaction();
            
            if (!accountInfo) {
                console.log("Creating associated token account for treasury...");
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        payerKeypair.publicKey,
                        treasuryTokenAccount,
                        treasuryWallet,
                        mint,
                        TOKEN_2022_PROGRAM_ID
                    )
                );
            }

            // Add mint instruction
            const mintAmount = BigInt(TOTAL_SUPPLY) * BigInt(10 ** DECIMALS);
            transaction.add(
                createMintToInstruction(
                    mint,
                    treasuryTokenAccount,
                    payerKeypair.publicKey, // Assuming deployer is mint authority
                    mintAmount,
                    [],
                    TOKEN_2022_PROGRAM_ID
                )
            );

            const mintSig = await sendAndConfirmTransaction(
                connection,
                transaction,
                [payerKeypair],
                {
                    commitment: 'confirmed',
                }
            );

            console.log(`Minted ${TOTAL_SUPPLY.toLocaleString()} tokens to treasury`);
            console.log("Transaction signature:", mintSig);

            // Now burn mint authority
            console.log("\n🔥 Burning mint authority...");
            const burnTx = new Transaction().add(
                createSetAuthorityInstruction(
                    mint,
                    payerKeypair.publicKey,
                    AuthorityType.MintTokens,
                    null,
                    [],
                    TOKEN_2022_PROGRAM_ID
                )
            );

            const burnSig = await sendAndConfirmTransaction(
                connection,
                burnTx,
                [payerKeypair],
                {
                    commitment: 'confirmed',
                }
            );

            console.log("Mint authority burned successfully!");
            console.log("Transaction signature:", burnSig);
        }

        // Save configuration
        const configPath = path.join(__dirname, '..', 'miko-token-config.json');
        const config = {
            mint: mint.toBase58(),
            decimals: DECIMALS,
            totalSupply: TOTAL_SUPPLY,
            transferFeeBasisPoints: 500, // 5%
            treasuryWallet: treasuryWallet.toBase58(),
            treasuryTokenAccount: await getAssociatedTokenAddress(mint, treasuryWallet, false, TOKEN_2022_PROGRAM_ID),
            absoluteVaultProgram: "838Ra5u255By2HkV7mtzP6KFgXnjrQiQDB3Gmdpbrf2d",
            smartDialProgram: "67sZQtNqoRs5RjncYXMaeRAGrgUK49GSaLJCvHA2SXrj",
            createdAt: new Date().toISOString(),
        };
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log("\n✅ Configuration saved to:", configPath);

        // Final check
        const finalMintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
        console.log("\n✅ MIKO Token Status:");
        console.log("- Mint:", mint.toBase58());
        console.log("- Supply:", (Number(finalMintInfo.supply) / 10 ** DECIMALS).toLocaleString());
        console.log("- Mint Authority:", finalMintInfo.mintAuthority?.toBase58() || "BURNED ✅");
        console.log("- Transfer Fee: 5%");

    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

// Run the script
main();