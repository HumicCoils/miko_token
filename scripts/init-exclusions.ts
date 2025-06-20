import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt");

async function initializeExclusions() {
  console.log("Initializing exclusions...");
  
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
  
  // Create program
  const program = new Program(idl, ABSOLUTE_VAULT_PROGRAM_ID, provider);
  
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
  
  console.log("Authority:", wallet.publicKey.toBase58());
  console.log("Tax Config PDA:", taxConfigPDA.toBase58());
  console.log("Reward Exclusions PDA:", rewardExclusionsPDA.toBase58());
  console.log("Tax Exemptions PDA:", taxExemptionsPDA.toBase58());
  
  try {
    // Check if already initialized
    const rewardExclusionsInfo = await connection.getAccountInfo(rewardExclusionsPDA);
    const taxExemptionsInfo = await connection.getAccountInfo(taxExemptionsPDA);
    
    if (rewardExclusionsInfo && taxExemptionsInfo) {
      console.log("\n✅ Exclusions already initialized!");
      
      // Fetch and display current exclusions
      try {
        const rewardExclusions = await program.account.exclusionList.fetch(rewardExclusionsPDA) as any;
        const taxExemptions = await program.account.exclusionList.fetch(taxExemptionsPDA) as any;
        
        console.log("\nCurrent reward exclusions:", rewardExclusions.addresses.length, "addresses");
        if (rewardExclusions.addresses.length > 0) {
          rewardExclusions.addresses.forEach((addr: PublicKey, i: number) => 
            console.log(`  ${i + 1}. ${addr.toBase58()}`)
          );
        }
        
        console.log("\nCurrent tax exemptions:", taxExemptions.addresses.length, "addresses");
        if (taxExemptions.addresses.length > 0) {
          taxExemptions.addresses.forEach((addr: PublicKey, i: number) => 
            console.log(`  ${i + 1}. ${addr.toBase58()}`)
          );
        }
      } catch (e) {
        console.log("Could not fetch exclusion details.");
      }
      return;
    }
    
    const tx = await program.methods
      .initializeExclusions(
        [], // initial reward exclusions (empty)
        []  // initial tax exemptions (empty)
      )
      .accounts({
        authority: wallet.publicKey,
        taxConfig: taxConfigPDA,
        rewardExclusions: rewardExclusionsPDA,
        taxExemptions: taxExemptionsPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("\n✅ Exclusions initialized successfully!");
    console.log("Transaction signature:", tx);
    
  } catch (error: any) {
    if (error.toString().includes("already in use")) {
      console.log("\n✅ Exclusions already initialized!");
    } else {
      console.error("\n❌ Error initializing exclusions:", error.message);
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

Promise.race([initializeExclusions(), timeoutPromise])
  .then(() => {
    console.log("\n✅ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error.message);
    process.exit(1);
  });