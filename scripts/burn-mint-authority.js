const {
    Connection,
    PublicKey,
    Keypair,
    Transaction,
    sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
    TOKEN_2022_PROGRAM_ID,
    AuthorityType,
    createSetAuthorityInstruction,
} = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MINT_ADDRESS = "BiQUbqckzG7C4hhv6vCYBeEx7KDEgaXqK1M3x9X67KKh";

async function main() {
    try {
        const connection = new Connection("https://solana-devnet.g.alchemy.com/v2/2jGjgPNpf7uX1gGZVT9Lp8uF_elh2PL5", 'confirmed');
        const mint = new PublicKey(MINT_ADDRESS);
        
        // Load payer keypair (deployer/current mint authority)
        const payerPath = path.join(os.homedir(), '.config/solana/deployer-test.json');
        const payerKeypair = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(payerPath, 'utf-8')))
        );
        
        console.log("🔥 Burning MIKO Token Mint Authority");
        console.log("=".repeat(50));
        console.log("Mint:", mint.toBase58());
        console.log("Current Authority:", payerKeypair.publicKey.toBase58());
        console.log("\n⚠️  This action is IRREVERSIBLE!");
        console.log("No more MIKO tokens can ever be minted after this.");
        
        // Create burn instruction
        const burnTx = new Transaction().add(
            createSetAuthorityInstruction(
                mint,
                payerKeypair.publicKey,
                AuthorityType.MintTokens,
                null, // Setting to null burns the authority
                [],
                TOKEN_2022_PROGRAM_ID
            )
        );

        console.log("\nSending transaction...");
        const sig = await sendAndConfirmTransaction(
            connection,
            burnTx,
            [payerKeypair],
            {
                commitment: 'confirmed',
                skipPreflight: false,
            }
        );

        console.log("\n✅ Mint authority successfully burned!");
        console.log("Transaction signature:", sig);
        console.log("\nThe total supply of MIKO tokens is now permanently fixed at 1,000,000,000");
        
    } catch (error) {
        console.error("Error:", error);
    }
}

main();