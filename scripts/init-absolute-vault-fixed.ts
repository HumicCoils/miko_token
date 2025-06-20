import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";
import path from "path";

// Use the actual deployed program IDs
const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("DoYzf44aokfs1voj338Xbg16uHoCzKhLv3fDJ6BgraME");
const SMART_DIAL_PROGRAM_ID = new PublicKey("KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA");

async function initializeAbsoluteVault() {
  console.log("Initializing Absolute Vault with correct program ID...");
  
  // Load wallet
  const walletPath = path.join(process.env.HOME!, ".config/solana/deployer-test.json");
  const walletData = fs.readFileSync(walletPath, "utf-8");
  const wallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(walletData)));
  
  // Create connection and provider
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const provider = new AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  
  // Load IDL
  const idlPath = path.join(__dirname, "../target/idl/absolute_vault.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  
  // Override the address in IDL
  idl.address = ABSOLUTE_VAULT_PROGRAM_ID.toBase58();
  
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
  
  // For now, use wrapped SOL as dummy token mint
  const dummyTokenMint = new PublicKey("So11111111111111111111111111111111111111112");
  
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
    
  } catch (error: any) {
    if (error.toString().includes("already in use")) {
      console.log("\n✅ Program is already initialized!");
    } else {
      console.error("\n❌ Error:", error.message);
      throw error;
    }
  }
}

initializeAbsoluteVault()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed:", error);
    process.exit(1);
  });
