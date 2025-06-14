import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { SmartDial } from "../target/types/smart_dial";
import * as fs from "fs";

const SMART_DIAL_PROGRAM_ID = new PublicKey("KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA");

async function main() {
  // Configure the client
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.SmartDial as Program<SmartDial>;
  
  // Get command line arguments or use defaults
  const args = process.argv.slice(2);
  
  // Load wallets or create new ones
  let keeperBotPubkey: PublicKey;
  let treasuryWallet: PublicKey;
  let ownerWallet: PublicKey;
  
  // Check if wallets exist, otherwise prompt to create them
  try {
    const keeperBotKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync("keeper-bot-wallet.json", "utf-8")))
    );
    keeperBotPubkey = keeperBotKeypair.publicKey;
  } catch {
    console.log("Keeper bot wallet not found. Please create it first:");
    console.log("solana-keygen new -o keeper-bot-wallet.json");
    process.exit(1);
  }
  
  try {
    const treasuryKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync("treasury-wallet.json", "utf-8")))
    );
    treasuryWallet = treasuryKeypair.publicKey;
  } catch {
    console.log("Treasury wallet not found. Please create it first:");
    console.log("solana-keygen new -o treasury-wallet.json");
    process.exit(1);
  }
  
  try {
    const ownerKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync("owner-wallet.json", "utf-8")))
    );
    ownerWallet = ownerKeypair.publicKey;
  } catch {
    console.log("Owner wallet not found. Please create it first:");
    console.log("solana-keygen new -o owner-wallet.json");
    process.exit(1);
  }
  
  // Derive PDA
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    SMART_DIAL_PROGRAM_ID
  );
  
  console.log("Initializing Smart Dial...");
  console.log("Config PDA:", configPDA.toBase58());
  console.log("Keeper Bot:", keeperBotPubkey.toBase58());
  console.log("Treasury Wallet:", treasuryWallet.toBase58());
  console.log("Owner Wallet:", ownerWallet.toBase58());
  console.log("AI Agent Twitter ID: @mikolovescrypto");
  
  try {
    const tx = await program.methods
      .initialize(
        keeperBotPubkey,
        treasuryWallet,
        ownerWallet,
        "@mikolovescrypto"
      )
      .accounts({
        authority: provider.wallet.publicKey,
        config: configPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("Smart Dial initialized successfully!");
    console.log("Transaction signature:", tx);
  } catch (error) {
    console.error("Error initializing Smart Dial:", error);
    if (error.toString().includes("already in use")) {
      console.log("Program is already initialized.");
    }
  }
}

main().catch(console.error);