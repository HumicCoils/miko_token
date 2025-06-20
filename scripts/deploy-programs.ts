import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

async function deployPrograms() {
  console.log("Deploying MIKO Token programs to devnet...\n");
  
  try {
    // Check if deployer wallet exists
    const walletPath = path.join(process.env.HOME!, ".config/solana/deployer-test.json");
    if (!fs.existsSync(walletPath)) {
      throw new Error("Deployer wallet not found at ~/.config/solana/deployer-test.json");
    }
    
    // Set config
    console.log("Setting Solana config...");
    await execAsync('solana config set --url devnet');
    await execAsync(`solana config set --keypair ${walletPath}`);
    
    // Check balance
    const { stdout: balanceOutput } = await execAsync('solana balance');
    console.log(`Deployer balance: ${balanceOutput.trim()}`);
    
    const balance = parseFloat(balanceOutput.split(' ')[0]);
    if (balance < 5) {
      console.log("Low balance, requesting airdrop...");
      await execAsync('solana airdrop 2');
      console.log("Airdrop complete.");
    }
    
    // Deploy Absolute Vault
    console.log("\n1. Deploying Absolute Vault...");
    const absoluteVaultKeypair = "target/deploy/absolute_vault-keypair.json";
    
    try {
      const { stdout: deployOutput1 } = await execAsync(
        `solana program deploy target/deploy/absolute_vault.so --program-id ${absoluteVaultKeypair}`
      );
      console.log("Absolute Vault deployed!");
      console.log(deployOutput1);
    } catch (error: any) {
      if (error.message.includes("Program already exists")) {
        console.log("Absolute Vault already deployed, upgrading...");
        const { stdout: upgradeOutput1 } = await execAsync(
          `solana program deploy target/deploy/absolute_vault.so --program-id ${absoluteVaultKeypair} --upgrade-authority ${walletPath}`
        );
        console.log(upgradeOutput1);
      } else {
        throw error;
      }
    }
    
    // Deploy Smart Dial
    console.log("\n2. Deploying Smart Dial...");
    const smartDialKeypair = "target/deploy/smart_dial-keypair.json";
    
    try {
      const { stdout: deployOutput2 } = await execAsync(
        `solana program deploy target/deploy/smart_dial.so --program-id ${smartDialKeypair}`
      );
      console.log("Smart Dial deployed!");
      console.log(deployOutput2);
    } catch (error: any) {
      if (error.message.includes("Program already exists")) {
        console.log("Smart Dial already deployed, upgrading...");
        const { stdout: upgradeOutput2 } = await execAsync(
          `solana program deploy target/deploy/smart_dial.so --program-id ${smartDialKeypair} --upgrade-authority ${walletPath}`
        );
        console.log(upgradeOutput2);
      } else {
        throw error;
      }
    }
    
    // Get deployed program IDs
    const { stdout: absoluteVaultId } = await execAsync(`solana address -k ${absoluteVaultKeypair}`);
    const { stdout: smartDialId } = await execAsync(`solana address -k ${smartDialKeypair}`);
    
    console.log("\n✅ Deployment complete!");
    console.log("\nDeployed Program IDs:");
    console.log(`Absolute Vault: ${absoluteVaultId.trim()}`);
    console.log(`Smart Dial: ${smartDialId.trim()}`);
    
    // Check if IDs match what's in the code
    const expectedAbsoluteVault = "355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt";
    const expectedSmartDial = "KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA";
    
    if (absoluteVaultId.trim() !== expectedAbsoluteVault) {
      console.log(`\n⚠️  WARNING: Absolute Vault deployed ID (${absoluteVaultId.trim()}) doesn't match expected ID (${expectedAbsoluteVault})`);
      console.log("You need to update the declare_id! in programs/absolute-vault/src/lib.rs");
    }
    
    if (smartDialId.trim() !== expectedSmartDial) {
      console.log(`\n⚠️  WARNING: Smart Dial deployed ID (${smartDialId.trim()}) doesn't match expected ID (${expectedSmartDial})`);
      console.log("You need to update the declare_id! in programs/smart-dial/src/lib.rs");
    }
    
  } catch (error: any) {
    console.error("❌ Deployment failed:", error.message);
    process.exit(1);
  }
}

deployPrograms().catch(console.error);