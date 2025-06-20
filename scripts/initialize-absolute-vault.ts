import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { AbsoluteVault } from "../target/types/absolute_vault";

const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt");
const SMART_DIAL_PROGRAM_ID = new PublicKey("KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA");

async function main() {
  // Configure the client
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.AbsoluteVault as Program<AbsoluteVault>;
  
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
  console.log("Tax Config PDA:", taxConfigPDA.toBase58());
  console.log("Tax Authority PDA:", taxAuthorityPDA.toBase58());
  console.log("Tax Holding PDA:", taxHoldingPDA.toBase58());
  console.log("Smart Dial Program:", SMART_DIAL_PROGRAM_ID.toBase58());
  
  try {
    const tx = await program.methods
      .initialize(SMART_DIAL_PROGRAM_ID)
      .accounts({
        authority: provider.wallet.publicKey,
        taxConfig: taxConfigPDA,
        taxAuthority: taxAuthorityPDA,
        taxHolding: taxHoldingPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("Absolute Vault initialized successfully!");
    console.log("Transaction signature:", tx);
  } catch (error: any) {
    console.error("Error initializing Absolute Vault:", error);
    if (error.toString().includes("already in use")) {
      console.log("Program is already initialized.");
    }
  }
}

main().catch(console.error);