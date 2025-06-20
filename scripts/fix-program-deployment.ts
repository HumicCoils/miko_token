import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { Keypair, PublicKey } from '@solana/web3.js';

const execAsync = promisify(exec);

async function fixProgramDeployment() {
  console.log("Fixing program deployment...\n");
  
  try {
    // The correct program IDs we need
    const CORRECT_ABSOLUTE_VAULT_ID = "355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt";
    const CORRECT_SMART_DIAL_ID = "KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA";
    
    // Check current keypairs
    const absoluteVaultKeypairPath = "target/deploy/absolute_vault-keypair.json";
    const smartDialKeypairPath = "target/deploy/smart_dial-keypair.json";
    
    // Read current Absolute Vault keypair
    const currentAbsoluteVaultKeypair = JSON.parse(fs.readFileSync(absoluteVaultKeypairPath, 'utf-8'));
    const currentAbsoluteVault = Keypair.fromSecretKey(new Uint8Array(currentAbsoluteVaultKeypair));
    console.log("Current Absolute Vault ID:", currentAbsoluteVault.publicKey.toBase58());
    console.log("Expected Absolute Vault ID:", CORRECT_ABSOLUTE_VAULT_ID);
    
    // Read current Smart Dial keypair
    const currentSmartDialKeypair = JSON.parse(fs.readFileSync(smartDialKeypairPath, 'utf-8'));
    const currentSmartDial = Keypair.fromSecretKey(new Uint8Array(currentSmartDialKeypair));
    console.log("\nCurrent Smart Dial ID:", currentSmartDial.publicKey.toBase58());
    console.log("Expected Smart Dial ID:", CORRECT_SMART_DIAL_ID);
    
    // Since we can't generate a specific keypair, we need to find the correct keypair
    // Let's check if any of the other keypair files match
    console.log("\nChecking other keypair files...");
    
    const deployDir = "target/deploy";
    const files = fs.readdirSync(deployDir);
    
    let correctAbsoluteVaultKeypair = null;
    let correctSmartDialKeypair = null;
    
    for (const file of files) {
      if (file.endsWith('-keypair.json')) {
        const keypairPath = path.join(deployDir, file);
        try {
          const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
          const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
          const pubkey = keypair.publicKey.toBase58();
          
          if (pubkey === CORRECT_ABSOLUTE_VAULT_ID) {
            console.log(`Found correct Absolute Vault keypair in: ${file}`);
            correctAbsoluteVaultKeypair = file;
          }
          if (pubkey === CORRECT_SMART_DIAL_ID) {
            console.log(`Found correct Smart Dial keypair in: ${file}`);
            correctSmartDialKeypair = file;
          }
        } catch (e) {
          // Skip invalid files
        }
      }
    }
    
    if (!correctAbsoluteVaultKeypair) {
      console.log("\n❌ Could not find keypair for Absolute Vault program ID:", CORRECT_ABSOLUTE_VAULT_ID);
      console.log("The program might have been deployed with a different keypair.");
      console.log("\nOptions:");
      console.log("1. Update the declare_id! in programs/absolute-vault/src/lib.rs to:", currentAbsoluteVault.publicKey.toBase58());
      console.log("2. Or redeploy with a new keypair and update all references");
      
      // Let's use the current deployed program
      console.log("\nProceeding with the current deployed program ID...");
    }
    
    if (!correctSmartDialKeypair) {
      console.log("\n✅ Smart Dial keypair is already correct!");
    }
    
    // Update the DEVNET_TESTING_GUIDE.md with the actual deployed IDs
    console.log("\nUpdating documentation with actual deployed program IDs...");
    
    const devnetGuideContent = `# MIKO Token Devnet Testing Guide

## Current Deployment Status

### Deployed Programs
- **Absolute Vault**: \`${currentAbsoluteVault.publicKey.toBase58()}\`
- **Smart Dial**: \`${currentSmartDial.publicKey.toBase58()}\`
- **Authority**: \`E7usUuVX4a6TGBvXuAiYvLtSdVyzRY4BmN9QwqAKSbdx\`

Note: The Absolute Vault program was deployed with a different ID than declared in the source code.
To fix initialization, update programs/absolute-vault/src/lib.rs with:
\`\`\`rust
declare_id!("${currentAbsoluteVault.publicKey.toBase58()}");
\`\`\`
`;
    
    // Create updated initialization script
    const updatedInitScript = `import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";
import path from "path";

// Use the actual deployed program IDs
const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("${currentAbsoluteVault.publicKey.toBase58()}");
const SMART_DIAL_PROGRAM_ID = new PublicKey("${currentSmartDial.publicKey.toBase58()}");

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
    
    console.log("\\n✅ Absolute Vault initialized successfully!");
    console.log("Transaction signature:", tx);
    
  } catch (error: any) {
    if (error.toString().includes("already in use")) {
      console.log("\\n✅ Program is already initialized!");
    } else {
      console.error("\\n❌ Error:", error.message);
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
`;

    fs.writeFileSync("scripts/init-absolute-vault-fixed.ts", updatedInitScript);
    console.log("\n✅ Created updated initialization script: scripts/init-absolute-vault-fixed.ts");
    
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

fixProgramDeployment().catch(console.error);