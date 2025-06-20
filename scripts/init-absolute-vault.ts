import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";
import path from "path";

const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt");
const SMART_DIAL_PROGRAM_ID = new PublicKey("KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA");

async function initializeAbsoluteVault() {
  console.log("Initializing Absolute Vault...");
  
  // Load wallet
  const walletPath = path.join(process.env.HOME!, ".config/solana/deployer-test.json");
  const walletData = fs.readFileSync(walletPath, "utf-8");
  const wallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(walletData)));
  
  // Create connection
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  // Create provider
  const provider = new AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  
  // Set provider globally
  anchor.setProvider(provider);
  
  // Load IDL
  const idlPath = path.join(__dirname, "../target/idl/absolute_vault.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  
  // Set the program ID in the IDL if it's missing
  if (!idl.address) {
    idl.address = ABSOLUTE_VAULT_PROGRAM_ID.toBase58();
  }
  
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
  
  console.log("Authority:", wallet.publicKey.toBase58());
  console.log("Tax Config PDA:", taxConfigPDA.toBase58());
  console.log("Tax Authority PDA:", taxAuthorityPDA.toBase58());
  console.log("Tax Holding PDA:", taxHoldingPDA.toBase58());
  console.log("Smart Dial Program:", SMART_DIAL_PROGRAM_ID.toBase58());
  
  // For now, use a dummy token mint address - this will be replaced when we create the actual MIKO token
  const dummyTokenMint = new PublicKey("So11111111111111111111111111111111111111112"); // Wrapped SOL
  
  try {
    const tx = await program.methods
      .initialize(SMART_DIAL_PROGRAM_ID)
      .accounts({
        authority: wallet.publicKey,
        taxConfig: taxConfigPDA,
        taxAuthorityPda: taxAuthorityPDA,
        taxHoldingPda: taxHoldingPDA,
        tokenMint: dummyTokenMint,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    
    console.log("\n✅ Absolute Vault initialized successfully!");
    console.log("Transaction signature:", tx);
    
    // Verify initialization
    const taxConfig = await program.account.taxConfig.fetch(taxConfigPDA) as any;
    console.log("\nVerified config:");
    console.log("- Authority:", taxConfig.authority.toBase58());
    console.log("- Smart Dial Program:", taxConfig.smartDialProgram.toBase58());
    console.log("- Total Tax Collected:", taxConfig.totalTaxCollected.toString());
    
  } catch (error: any) {
    if (error.toString().includes("already in use")) {
      console.log("\n✅ Program is already initialized!");
      
      // Fetch and display current config
      try {
        const taxConfig = await program.account.taxConfig.fetch(taxConfigPDA) as any;
        console.log("\nCurrent config:");
        console.log("- Authority:", taxConfig.authority.toBase58());
        console.log("- Smart Dial Program:", taxConfig.smartDialProgram.toBase58());
        console.log("- Total Tax Collected:", taxConfig.totalTaxCollected.toString());
      } catch (e) {
        console.log("Could not fetch config details.");
      }
    } else {
      console.error("\n❌ Error initializing Absolute Vault:", error.message);
      if (error.logs) {
        console.error("Program logs:", error.logs);
      }
      throw error;
    }
  }
}

// Run with timeout
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error("Script timed out after 30 seconds")), 30000);
});

Promise.race([initializeAbsoluteVault(), timeoutPromise])
  .then(() => {
    console.log("\n✅ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error.message);
    process.exit(1);
  });