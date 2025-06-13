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
    console.error("Usage: npm run add-reward-exclusion -- --address=ADDRESS_TO_EXCLUDE");
    process.exit(1);
  }
  
  const addressToExclude = new PublicKey(addressArg.split('=')[1]);
  
  // Configure the client
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.AbsoluteVault as Program<AbsoluteVault>;
  
  // Derive PDA
  const [rewardExclusionsPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("reward_exclusions")],
    ABSOLUTE_VAULT_PROGRAM_ID
  );
  
  console.log("Adding reward exclusion...");
  console.log("Address to exclude:", addressToExclude.toBase58());
  console.log("Reward Exclusions PDA:", rewardExclusionsPDA.toBase58());
  
  try {
    const tx = await program.methods
      .addRewardExclusion(addressToExclude)
      .accounts({
        authority: provider.wallet.publicKey,
        rewardExclusions: rewardExclusionsPDA,
      })
      .rpc();
    
    console.log("Address excluded from rewards successfully!");
    console.log("Transaction signature:", tx);
  } catch (error) {
    console.error("Error adding reward exclusion:", error);
  }
}

main().catch(console.error);