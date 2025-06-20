import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt");
const SMART_DIAL_PROGRAM_ID = new PublicKey("KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA");

async function main() {
  try {
    // Load wallet
    const walletPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME!, ".config/solana/deployer-test.json");
    const walletData = fs.readFileSync(walletPath, "utf-8");
    const wallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(walletData)));
    
    // Create connection
    const connection = new Connection(process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com", "confirmed");
    
    // Create provider
    const provider = new AnchorProvider(
      connection,
      new anchor.Wallet(wallet),
      { commitment: "confirmed" }
    );
    
    // Load IDL
    const idlPath = path.join(__dirname, "../target/idl/absolute_vault.json");
    const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
    
    // Create program
    const program = new Program(idl, ABSOLUTE_VAULT_PROGRAM_ID, provider);
    
    // Derive PDAs
    const [taxConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("tax_config")],
      ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    const [taxAuthorityPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("tax_authority")],
      ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    const [taxHoldingPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("tax_holding")],
      ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    console.log("Initializing Absolute Vault...");
    console.log("Authority:", wallet.publicKey.toBase58());
    console.log("Tax Config PDA:", taxConfigPDA.toBase58());
    console.log("Tax Authority PDA:", taxAuthorityPDA.toBase58());
    console.log("Tax Holding PDA:", taxHoldingPDA.toBase58());
    console.log("Smart Dial Program:", SMART_DIAL_PROGRAM_ID.toBase58());
    
    // Check if already initialized
    try {
      const taxConfig = await program.account.taxConfig.fetch(taxConfigPDA) as any;
      console.log("Program is already initialized!");
      console.log("Current config:", {
        authority: taxConfig.authority.toBase58(),
        smartDialProgram: taxConfig.smartDialProgram.toBase58(),
        totalTaxCollected: taxConfig.totalTaxCollected.toString(),
        lastDistribution: new Date(taxConfig.lastDistribution.toNumber() * 1000).toISOString()
      });
      return;
    } catch (e) {
      console.log("Program not initialized, proceeding with initialization...");
    }
    
    const tx = await program.methods
      .initialize(SMART_DIAL_PROGRAM_ID)
      .accounts({
        authority: wallet.publicKey,
        taxConfig: taxConfigPDA,
        taxAuthority: taxAuthorityPDA,
        taxHolding: taxHoldingPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("Absolute Vault initialized successfully!");
    console.log("Transaction signature:", tx);
    
    // Verify initialization
    const taxConfig = await program.account.taxConfig.fetch(taxConfigPDA) as any;
    console.log("Verified config:", {
      authority: taxConfig.authority.toBase58(),
      smartDialProgram: taxConfig.smartDialProgram.toBase58()
    });
    
  } catch (error: any) {
    console.error("Error:", error);
    if (error.logs) {
      console.error("Program logs:", error.logs);
    }
  }
}

main().catch(console.error);