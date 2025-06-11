import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { AbsoluteVault } from "../target/types/absolute_vault";
import { SmartDial } from "../target/types/smart_dial";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
const NETWORK = process.env.NETWORK || "devnet";
const KEEPER_BOT_PUBKEY = process.env.KEEPER_BOT_PUBKEY;
const TREASURY_WALLET = process.env.TREASURY_WALLET;
const OWNER_WALLET = process.env.OWNER_WALLET;

async function main() {
    console.log("🚀 Initializing MIKO Token Programs");
    
    // Validate environment variables
    if (!KEEPER_BOT_PUBKEY || !TREASURY_WALLET || !OWNER_WALLET) {
        throw new Error("Missing required environment variables: KEEPER_BOT_PUBKEY, TREASURY_WALLET, OWNER_WALLET");
    }
    
    // Configure provider
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    
    // Load programs
    const absoluteVault = anchor.workspace.AbsoluteVault as Program<AbsoluteVault>;
    const smartDial = anchor.workspace.SmartDial as Program<SmartDial>;
    
    console.log("Absolute Vault Program:", absoluteVault.programId.toString());
    console.log("Smart Dial Program:", smartDial.programId.toString());
    
    // Initialize Smart Dial first
    console.log("\n📝 Initializing Smart Dial...");
    
    const [smartDialConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from("smart_dial_config")],
        smartDial.programId
    );
    
    try {
        const tx1 = await smartDial.methods
            .initialize(
                new PublicKey(KEEPER_BOT_PUBKEY),
                new PublicKey(TREASURY_WALLET),
                new PublicKey(OWNER_WALLET),
                "1807336107638001665" // @mikolovescrypto Twitter ID
            )
            .accounts({
                admin: provider.wallet.publicKey,
                config: smartDialConfig,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();
            
        console.log("✅ Smart Dial initialized:", tx1);
    } catch (error: any) {
        if (error.toString().includes("already in use")) {
            console.log("⚠️  Smart Dial already initialized");
        } else {
            throw error;
        }
    }
    
    // Initialize Absolute Vault
    console.log("\n📝 Initializing Absolute Vault...");
    
    const [taxConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from("tax_config")],
        absoluteVault.programId
    );
    
    const [taxAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("tax_authority")],
        absoluteVault.programId
    );
    
    const [taxHoldingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("tax_holding")],
        absoluteVault.programId
    );
    
    // For initialization, we'll use a dummy token mint
    // In production, this should be the actual MIKO token mint
    const tokenMint = new PublicKey(process.env.MIKO_TOKEN_MINT || "11111111111111111111111111111111");
    
    try {
        const tx2 = await absoluteVault.methods
            .initialize(smartDial.programId)
            .accounts({
                authority: provider.wallet.publicKey,
                taxConfig,
                taxAuthorityPda,
                taxHoldingPda,
                tokenMint,
                systemProgram: anchor.web3.SystemProgram.programId,
                token2022Program: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
            })
            .rpc();
            
        console.log("✅ Absolute Vault initialized:", tx2);
    } catch (error: any) {
        if (error.toString().includes("already in use")) {
            console.log("⚠️  Absolute Vault already initialized");
        } else {
            throw error;
        }
    }
    
    // Save initialization info
    const initInfo = {
        network: NETWORK,
        absoluteVault: {
            programId: absoluteVault.programId.toString(),
            taxConfig: taxConfig.toString(),
            taxAuthorityPda: taxAuthorityPda.toString(),
            taxHoldingPda: taxHoldingPda.toString(),
        },
        smartDial: {
            programId: smartDial.programId.toString(),
            config: smartDialConfig.toString(),
        },
        wallets: {
            keeperBot: KEEPER_BOT_PUBKEY,
            treasury: TREASURY_WALLET,
            owner: OWNER_WALLET,
        },
        initializedAt: new Date().toISOString(),
    };
    
    const outputPath = path.join(__dirname, "..", "initialized-programs.json");
    fs.writeFileSync(outputPath, JSON.stringify(initInfo, null, 2));
    
    console.log("\n✅ Programs initialized successfully!");
    console.log("Configuration saved to:", outputPath);
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});