import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as borsh from "borsh";
import fs from "fs";
import path from "path";

const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt");
const SMART_DIAL_PROGRAM_ID = new PublicKey("KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA");

// Define the instruction discriminator (8 bytes) for "initialize"
// This is the first 8 bytes of sha256("global:initialize")
const INITIALIZE_DISCRIMINATOR = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);

async function initializeAbsoluteVault() {
  console.log("Initializing Absolute Vault (raw transaction)...");
  
  // Load wallet
  const walletPath = path.join(process.env.HOME!, ".config/solana/deployer-test.json");
  const walletData = fs.readFileSync(walletPath, "utf-8");
  const wallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(walletData)));
  
  // Create connection
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  // Derive PDAs
  const [taxConfigPDA, taxConfigBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("tax_config")],
    ABSOLUTE_VAULT_PROGRAM_ID
  );
  
  const [taxAuthorityPDA, taxAuthorityBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("tax_authority")],
    ABSOLUTE_VAULT_PROGRAM_ID
  );
  
  const [taxHoldingPDA, taxHoldingBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("tax_holding")],
    ABSOLUTE_VAULT_PROGRAM_ID
  );
  
  console.log("Authority:", wallet.publicKey.toBase58());
  console.log("Tax Config PDA:", taxConfigPDA.toBase58(), "bump:", taxConfigBump);
  console.log("Tax Authority PDA:", taxAuthorityPDA.toBase58(), "bump:", taxAuthorityBump);
  console.log("Tax Holding PDA:", taxHoldingPDA.toBase58(), "bump:", taxHoldingBump);
  console.log("Smart Dial Program:", SMART_DIAL_PROGRAM_ID.toBase58());
  
  // Check if already initialized
  const accountInfo = await connection.getAccountInfo(taxConfigPDA);
  if (accountInfo) {
    console.log("\n✅ Program is already initialized!");
    return;
  }
  
  // For now, use wrapped SOL as dummy token mint
  const dummyTokenMint = new PublicKey("So11111111111111111111111111111111111111112");
  
  // Serialize the smart_dial_program parameter
  const instructionData = Buffer.concat([
    INITIALIZE_DISCRIMINATOR,
    SMART_DIAL_PROGRAM_ID.toBuffer(),
  ]);
  
  // Create the instruction
  const instruction = new TransactionInstruction({
    programId: ABSOLUTE_VAULT_PROGRAM_ID,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: taxConfigPDA, isSigner: false, isWritable: true },
      { pubkey: taxAuthorityPDA, isSigner: false, isWritable: false },
      { pubkey: taxHoldingPDA, isSigner: false, isWritable: false },
      { pubkey: dummyTokenMint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: instructionData,
  });
  
  // Create and send transaction
  const transaction = new Transaction().add(instruction);
  
  try {
    console.log("\nSending transaction...");
    const signature = await connection.sendTransaction(transaction, [wallet], {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    
    console.log("Transaction sent:", signature);
    
    // Wait for confirmation
    const latestBlockhash = await connection.getLatestBlockhash();
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    console.log("\n✅ Absolute Vault initialized successfully!");
    console.log("Transaction signature:", signature);
    
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    if (error.logs) {
      console.error("Program logs:", error.logs);
    }
    throw error;
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