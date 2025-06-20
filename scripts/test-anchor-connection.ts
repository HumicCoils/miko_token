import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";

async function main() {
  console.log("Testing Anchor connection...");
  
  try {
    // Test connection
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const version = await connection.getVersion();
    console.log("Solana version:", version);
    
    // Test provider
    const provider = anchor.AnchorProvider.env();
    console.log("Provider wallet:", provider.wallet.publicKey.toBase58());
    console.log("Provider endpoint:", provider.connection.rpcEndpoint);
    
    // Test workspace
    const workspace = anchor.workspace;
    console.log("Workspace keys:", Object.keys(workspace));
    
    if (workspace.AbsoluteVault) {
      console.log("AbsoluteVault program found in workspace");
      console.log("Program ID:", workspace.AbsoluteVault.programId.toBase58());
    } else {
      console.log("AbsoluteVault program NOT found in workspace");
    }
    
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

main().catch(console.error);