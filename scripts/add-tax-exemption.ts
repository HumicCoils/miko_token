import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { AbsoluteVault } from "../target/types/absolute_vault";

const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt");

async function main() {
  // Get address from command line
  const args = process.argv.slice(2);
  const addressArg = args.find(arg => arg.startsWith('--address='));
  
  if (!addressArg) {
    console.error("Usage: npm run add-tax-exemption -- --address=ADDRESS_TO_EXEMPT");
    process.exit(1);
  }
  
  const addressToExempt = new PublicKey(addressArg.split('=')[1]);
  
  // Configure the client
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.AbsoluteVault as Program<AbsoluteVault>;
  
  // Derive PDA
  const [taxExemptionsPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("tax_exemptions")],
    ABSOLUTE_VAULT_PROGRAM_ID
  );
  
  console.log("Adding tax exemption...");
  console.log("Address to exempt:", addressToExempt.toBase58());
  console.log("Tax Exemptions PDA:", taxExemptionsPDA.toBase58());
  
  try {
    const tx = await program.methods
      .addTaxExemption(addressToExempt)
      .accounts({
        authority: provider.wallet.publicKey,
        taxExemptions: taxExemptionsPDA,
      })
      .rpc();
    
    console.log("Address exempted from tax successfully!");
    console.log("Transaction signature:", tx);
  } catch (error) {
    console.error("Error adding tax exemption:", error);
  }
}

main().catch(console.error);