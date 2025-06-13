const { Connection, PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

// New Program IDs
const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("8WxswFv712scfX5ef9BVDva18DnkfsTTUQjBCk2yW4yd");
const SMART_DIAL_PROGRAM_ID = new PublicKey("C4S6VBsqxWsVieMfR2RcJNyFUnUUnuFDkg5g7km7rU23");

// Wallet addresses
const KEEPER_BOT_PUBKEY = new PublicKey("CqjraVtYWqwfxZjHPemqoqNu1QYZvjBZoonJxTm7CinG");
const TREASURY_WALLET = new PublicKey("ESEQvotDCxHancsHSsV4UXLPrhyFe6K16ncbJbi9Y4DQ");
const OWNER_WALLET = new PublicKey("FwN6tCpJkHhuYxBKwcrGU6PDW4aRNuukQBi58ay4iYGM");

// Token
const MIKO_TOKEN_MINT = new PublicKey("BiQUbqckzG7C4hhv6vCYBeEx7KDEgaXqK1M3x9X67KKh");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

async function main() {
    console.log("🚀 Initializing NEW MIKO Token Programs");
    
    // Setup connection
    const connection = new Connection("https://devnet.helius-rpc.com/?api-key=5f61f63f-b155-45d7-b8fe-19ec8dda058a", "confirmed");
    
    // Load deployer wallet
    const deployerPath = path.join(process.env.HOME, '.config', 'solana', 'deployer-test.json');
    const deployerKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(deployerPath, 'utf-8')))
    );
    
    const wallet = new Wallet(deployerKeypair);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    
    console.log("Deployer:", deployerKeypair.publicKey.toString());
    
    // Load IDLs
    const absoluteVaultIdl = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../target/idl/absolute_vault.json'), 'utf8')
    );
    const smartDialIdl = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../target/idl/smart_dial.json'), 'utf8')
    );
    
    // Create program instances
    const absoluteVault = new Program(absoluteVaultIdl, ABSOLUTE_VAULT_PROGRAM_ID, provider);
    const smartDial = new Program(smartDialIdl, SMART_DIAL_PROGRAM_ID, provider);
    
    console.log("\n📋 Program Information:");
    console.log("Absolute Vault:", ABSOLUTE_VAULT_PROGRAM_ID.toString());
    console.log("Smart Dial:", SMART_DIAL_PROGRAM_ID.toString());
    
    // Derive PDAs
    const [taxConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("tax_config")],
        ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    const [taxAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("tax_authority")],
        ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    const [taxHoldingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("tax_holding")],
        ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    const [smartDialConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        SMART_DIAL_PROGRAM_ID
    );
    
    console.log("\n🔑 PDAs:");
    console.log("Tax Config:", taxConfigPda.toString());
    console.log("Tax Authority:", taxAuthorityPda.toString());
    console.log("Tax Holding:", taxHoldingPda.toString());
    console.log("Smart Dial Config:", smartDialConfigPda.toString());
    
    try {
        // Initialize Absolute Vault
        console.log("\n1️⃣ Initializing Absolute Vault...");
        
        const initVaultTx = await absoluteVault.methods
            .initialize(SMART_DIAL_PROGRAM_ID)
            .accounts({
                authority: deployerKeypair.publicKey,
                taxConfig: taxConfigPda,
                taxAuthorityPda: taxAuthorityPda,
                taxHoldingPda: taxHoldingPda,
                tokenMint: MIKO_TOKEN_MINT,
                systemProgram: SystemProgram.programId,
                token2022Program: TOKEN_2022_PROGRAM_ID,
            })
            .rpc();
            
        console.log("✅ Absolute Vault initialized:", initVaultTx);
        
        // Initialize Smart Dial
        console.log("\n2️⃣ Initializing Smart Dial...");
        
        const initDialTx = await smartDial.methods
            .initialize(
                KEEPER_BOT_PUBKEY,
                TREASURY_WALLET,
                OWNER_WALLET
            )
            .accounts({
                authority: deployerKeypair.publicKey,
                config: smartDialConfigPda,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
            
        console.log("✅ Smart Dial initialized:", initDialTx);
        
        // Update configuration file
        const config = {
            network: "devnet",
            programs: {
                absoluteVault: ABSOLUTE_VAULT_PROGRAM_ID.toString(),
                smartDial: SMART_DIAL_PROGRAM_ID.toString(),
            },
            pdas: {
                taxConfig: taxConfigPda.toString(),
                taxAuthority: taxAuthorityPda.toString(),
                taxHolding: taxHoldingPda.toString(),
                smartDialConfig: smartDialConfigPda.toString(),
            },
            wallets: {
                treasury: TREASURY_WALLET.toString(),
                owner: OWNER_WALLET.toString(),
                keeperBot: KEEPER_BOT_PUBKEY.toString(),
            },
            token: {
                mint: MIKO_TOKEN_MINT.toString(),
                decimals: 9,
                transferFeeBasisPoints: 500,
            },
            initializedAt: new Date().toISOString(),
        };
        
        fs.writeFileSync(
            path.join(__dirname, '../miko-token-config-new.json'),
            JSON.stringify(config, null, 2)
        );
        
        console.log("\n✅ Programs initialized successfully!");
        console.log("Configuration saved to miko-token-config-new.json");
        
    } catch (error) {
        console.error("\n❌ Error during initialization:", error);
        if (error.logs) {
            console.error("Program logs:", error.logs);
        }
    }
}

main().catch(console.error);