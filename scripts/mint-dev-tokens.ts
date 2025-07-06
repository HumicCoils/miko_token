import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
    TOKEN_2022_PROGRAM_ID,
    mintTo,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    getAccount,
} from '@solana/spl-token';
import * as fs from 'fs';

// Load wallet helper
function loadWallet(filePath: string): Keypair {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(data));
}

async function mintDevTokens() {
    console.log('🪙 Minting MIKO Dev-Tokens for testing...\n');

    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Load wallets
    const authority = loadWallet('../owner-wallet.json');
    const devMint = new PublicKey('PBbVBUPWMzC2LVu4Qb51qJfpp6XfGjY5nCGJhoUWYUf');
    
    console.log('📋 Configuration:');
    console.log(`  Dev Token Mint: ${devMint.toBase58()}`);
    console.log(`  Mint Authority: ${authority.publicKey.toBase58()}\n`);

    try {
        // Get or create authority's token account
        const authorityAta = await getAssociatedTokenAddress(
            devMint,
            authority.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID
        );

        let authorityAccount;
        try {
            authorityAccount = await getAccount(
                connection,
                authorityAta,
                'confirmed',
                TOKEN_2022_PROGRAM_ID
            );
            console.log(`Authority token account exists with balance: ${Number(authorityAccount.amount) / 10**9} tokens`);
        } catch (e) {
            console.log('Creating authority token account...');
            const createAtaIx = createAssociatedTokenAccountInstruction(
                authority.publicKey,
                authorityAta,
                authority.publicKey,
                devMint,
                TOKEN_2022_PROGRAM_ID
            );
            const createTx = new Transaction().add(createAtaIx);
            await sendAndConfirmTransaction(connection, createTx, [authority]);
            console.log('✅ Authority token account created');
        }

        // Mint tokens to authority
        const mintAmount = 1_000_000 * 10**9; // 1 million tokens
        console.log(`\n🏭 Minting ${mintAmount / 10**9} Dev-Tokens to authority...`);
        
        const mintSig = await mintTo(
            connection,
            authority,
            devMint,
            authorityAta,
            authority,
            mintAmount,
            [],
            { commitment: 'confirmed' },
            TOKEN_2022_PROGRAM_ID
        );

        console.log('✅ Tokens minted successfully!');
        console.log(`   Transaction: ${mintSig}`);

        // Check final balance
        const finalAccount = await getAccount(
            connection,
            authorityAta,
            'confirmed',
            TOKEN_2022_PROGRAM_ID
        );
        console.log(`\n💰 Authority final balance: ${Number(finalAccount.amount) / 10**9} Dev-Tokens`);
        console.log('\n🎉 Dev tokens ready for testing!');
        console.log('   You can now run the test suite to test fee harvesting and distribution.');

    } catch (error) {
        console.error('❌ Error minting tokens:', error);
        throw error;
    }
}

// Run the script
if (require.main === module) {
    mintDevTokens()
        .then(() => {
            console.log('\n✅ Script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Script failed:', error);
            process.exit(1);
        });
}

export { mintDevTokens };