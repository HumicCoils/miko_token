const {
    Connection,
    PublicKey,
    Keypair,
} = require('@solana/web3.js');
const {
    TOKEN_2022_PROGRAM_ID,
    getMint,
    getAccount,
    getAssociatedTokenAddress,
} = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MINT_ADDRESS = "BiQUbqckzG7C4hhv6vCYBeEx7KDEgaXqK1M3x9X67KKh";

async function main() {
    try {
        const connection = new Connection("https://solana-devnet.g.alchemy.com/v2/2jGjgPNpf7uX1gGZVT9Lp8uF_elh2PL5", 'confirmed');
        const mint = new PublicKey(MINT_ADDRESS);
        
        // Get mint info
        const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
        
        console.log("🪙 MIKO Token Status");
        console.log("=".repeat(50));
        console.log("Mint Address:", mint.toBase58());
        console.log("Total Supply:", (Number(mintInfo.supply) / 10 ** mintInfo.decimals).toLocaleString());
        console.log("Decimals:", mintInfo.decimals);
        console.log("Mint Authority:", mintInfo.mintAuthority?.toBase58() || "BURNED ✅");
        console.log("Freeze Authority:", mintInfo.freezeAuthority?.toBase58() || "None ✅");
        
        // Check treasury balance
        const treasuryKeypairPath = path.join(os.homedir(), '.config/solana/treasury-test.json');
        const treasuryKeypair = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(treasuryKeypairPath, 'utf-8')))
        );
        const treasuryWallet = treasuryKeypair.publicKey;
        
        const treasuryTokenAccount = await getAssociatedTokenAddress(
            mint,
            treasuryWallet,
            false,
            TOKEN_2022_PROGRAM_ID
        );
        
        try {
            const treasuryAccount = await getAccount(connection, treasuryTokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
            console.log("\n💰 Treasury Balance:");
            console.log("Wallet:", treasuryWallet.toBase58());
            console.log("Token Account:", treasuryTokenAccount.toBase58());
            console.log("Balance:", (Number(treasuryAccount.amount) / 10 ** mintInfo.decimals).toLocaleString(), "MIKO");
        } catch (e) {
            console.log("\n⚠️  Treasury token account not found");
        }
        
        // Save configuration
        const config = {
            mint: mint.toBase58(),
            decimals: mintInfo.decimals,
            totalSupply: Number(mintInfo.supply) / 10 ** mintInfo.decimals,
            transferFeeBasisPoints: 500, // 5%
            treasuryWallet: treasuryWallet.toBase58(),
            treasuryTokenAccount: treasuryTokenAccount.toBase58(),
            absoluteVaultProgram: "838Ra5u255By2HkV7mtzP6KFgXnjrQiQDB3Gmdpbrf2d",
            smartDialProgram: "67sZQtNqoRs5RjncYXMaeRAGrgUK49GSaLJCvHA2SXrj",
            status: {
                tokenCreated: true,
                mintAuthorityBurned: !mintInfo.mintAuthority,
                absoluteVaultInitialized: false, // Still pending
                smartDialInitialized: true
            },
            createdAt: new Date().toISOString(),
        };
        
        const configPath = path.join(__dirname, '..', 'miko-token-config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log("\n✅ Configuration saved to:", configPath);
        
        // Next steps
        console.log("\n📋 Next Steps:");
        if (mintInfo.mintAuthority) {
            console.log("1. ⚠️  Burn mint authority to finalize token supply");
        } else {
            console.log("1. ✅ Mint authority already burned");
        }
        console.log("2. Initialize Absolute Vault with token mint:", mint.toBase58());
        console.log("3. Configure keeper bot");
        console.log("4. Start testing transfers and tax collection");
        
    } catch (error) {
        console.error("Error:", error);
    }
}

main();