import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt");

async function main() {
  console.log("Starting initialization test...");
  
  try {
    console.log("1. Loading wallet...");
    const walletPath = path.join(process.env.HOME!, ".config/solana/deployer-test.json");
    const walletData = fs.readFileSync(walletPath, "utf-8");
    const wallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(walletData)));
    console.log("Wallet loaded:", wallet.publicKey.toBase58());
    
    console.log("\n2. Creating connection...");
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const version = await connection.getVersion();
    console.log("Connected to Solana:", version);
    
    console.log("\n3. Checking wallet balance...");
    const balance = await connection.getBalance(wallet.publicKey);
    console.log("Wallet balance:", balance / 1e9, "SOL");
    
    console.log("\n4. Deriving PDAs...");
    const [taxConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("tax_config")],
      ABSOLUTE_VAULT_PROGRAM_ID
    );
    console.log("Tax Config PDA:", taxConfigPDA.toBase58());
    
    console.log("\n5. Checking if program account exists...");
    const accountInfo = await connection.getAccountInfo(taxConfigPDA);
    if (accountInfo) {
      console.log("Tax Config account exists!");
      console.log("Account owner:", accountInfo.owner.toBase58());
      console.log("Account data length:", accountInfo.data.length);
      console.log("Program is likely already initialized.");
    } else {
      console.log("Tax Config account does not exist - program needs initialization.");
    }
    
    console.log("\n6. Checking program itself...");
    const programInfo = await connection.getAccountInfo(ABSOLUTE_VAULT_PROGRAM_ID);
    if (programInfo) {
      console.log("Program account exists!");
      console.log("Program is executable:", programInfo.executable);
    } else {
      console.log("Program account does not exist!");
    }
    
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

// Add timeout
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error("Script timed out after 10 seconds")), 10000);
});

Promise.race([main(), timeoutPromise])
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error.message);
    process.exit(1);
  });