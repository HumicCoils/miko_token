import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const SMART_DIAL_PROGRAM_ID = new PublicKey("KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA");

async function initializeSmartDial() {
  console.log("Initializing Smart Dial...");
  
  // Load deployer wallet
  const walletPath = path.join(process.env.HOME!, ".config/solana/deployer-test.json");
  const walletData = fs.readFileSync(walletPath, "utf-8");
  const wallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(walletData)));
  
  // Load other wallets
  const keeperBotKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync("keeper-bot-wallet.json", "utf-8")))
  );
  const treasuryKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync("treasury-wallet.json", "utf-8")))
  );
  const ownerKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync("owner-wallet.json", "utf-8")))
  );
  
  // Create connection and provider
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const provider = new AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  
  // Load IDL
  const idlPath = path.join(__dirname, "../target/idl/smart_dial.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  
  // Create program
  const program = new Program(idl, SMART_DIAL_PROGRAM_ID, provider);
  
  // Derive PDA
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("smart_dial_config")],
    SMART_DIAL_PROGRAM_ID
  );
  
  console.log("Authority:", wallet.publicKey.toBase58());
  console.log("Config PDA:", configPDA.toBase58());
  console.log("Keeper Bot:", keeperBotKeypair.publicKey.toBase58());
  console.log("Treasury Wallet:", treasuryKeypair.publicKey.toBase58());
  console.log("Owner Wallet:", ownerKeypair.publicKey.toBase58());
  console.log("AI Agent Twitter ID: @mikolovescrypto");
  
  try {
    const tx = await program.methods
      .initialize(
        keeperBotKeypair.publicKey,
        treasuryKeypair.publicKey,
        ownerKeypair.publicKey,
        "@mikolovescrypto"
      )
      .accounts({
        authority: wallet.publicKey,
        config: configPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("\n✅ Smart Dial initialized successfully!");
    console.log("Transaction signature:", tx);
    
    // Verify initialization
    const config = await program.account.config.fetch(configPDA) as any;
    console.log("\nVerified config:");
    console.log("- Authority:", config.authority.toBase58());
    console.log("- Keeper Bot:", config.keeperBot.toBase58());
    console.log("- Treasury Wallet:", config.treasuryWallet.toBase58());
    console.log("- Owner Wallet:", config.ownerWallet.toBase58());
    console.log("- AI Agent Twitter ID:", config.aiAgentTwitterId);
    
  } catch (error: any) {
    if (error.toString().includes("already in use")) {
      console.log("\n✅ Program is already initialized!");
      
      // Fetch and display current config
      try {
        const config = await program.account.config.fetch(configPDA) as any;
        console.log("\nCurrent config:");
        console.log("- Authority:", config.authority.toBase58());
        console.log("- Keeper Bot:", config.keeperBot.toBase58());
        console.log("- Treasury Wallet:", config.treasuryWallet.toBase58());
        console.log("- Owner Wallet:", config.ownerWallet.toBase58());
        console.log("- AI Agent Twitter ID:", config.aiAgentTwitterId);
        console.log("- Current Reward Token:", config.currentRewardToken.toBase58());
      } catch (e) {
        console.log("Could not fetch config details.");
      }
    } else {
      console.error("\n❌ Error initializing Smart Dial:", error.message);
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

Promise.race([initializeSmartDial(), timeoutPromise])
  .then(() => {
    console.log("\n✅ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error.message);
    process.exit(1);
  });