import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { AbsoluteVault } from "../target/types/absolute_vault";

const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt");

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
  
  const [rewardExclusionsPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("reward_exclusions")],
    ABSOLUTE_VAULT_PROGRAM_ID
  );
  
  const [taxExemptionsPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("tax_exemptions")],
    ABSOLUTE_VAULT_PROGRAM_ID
  );
  
  console.log("Initializing exclusions...");
  console.log("Tax Config PDA:", taxConfigPDA.toBase58());
  console.log("Reward Exclusions PDA:", rewardExclusionsPDA.toBase58());
  console.log("Tax Exemptions PDA:", taxExemptionsPDA.toBase58());
  
  try {
    const tx = await program.methods
      .initializeExclusions(
        [], // initial reward exclusions (empty)
        []  // initial tax exemptions (empty)
      )
      .accounts({
        authority: provider.wallet.publicKey,
        taxConfig: taxConfigPDA,
        rewardExclusions: rewardExclusionsPDA,
        taxExemptions: taxExemptionsPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("Exclusions initialized successfully!");
    console.log("Transaction signature:", tx);
  } catch (error) {
    console.error("Error initializing exclusions:", error);
  }
}

main().catch(console.error);