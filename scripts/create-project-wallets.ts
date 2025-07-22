import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import bs58 from 'bs58';

function main() {
  console.log('🔑 Creating MIKO Token Project Wallets with Full Recovery Info...\n');

  // Authority wallet - already exists (deployer)
  const deployerPath = '/shared-artifacts/deployer-keypair.json';
  const deployerRaw = fs.readFileSync(deployerPath, 'utf-8');
  const deployerKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(deployerRaw)));
  const deployerPrivateKey = bs58.encode(deployerKeypair.secretKey);
  
  console.log('🔐 Authority Wallet (overall management):');
  console.log('   Public Key:', deployerKeypair.publicKey.toBase58());
  console.log('   Status: Using existing deployer wallet');

  // Create owner wallet (receives 20% of tax)
  const ownerKeypair = Keypair.generate();
  const ownerPrivateKey = bs58.encode(ownerKeypair.secretKey);
  console.log('\n👤 Owner Wallet (20% tax recipient):');
  console.log('   Public Key:', ownerKeypair.publicKey.toBase58());

  // Create treasury wallet (holds 80% of tax for distribution to holders)
  const treasuryKeypair = Keypair.generate();
  const treasuryPrivateKey = bs58.encode(treasuryKeypair.secretKey);
  console.log('\n💰 Treasury Wallet (80% holder distributions):');
  console.log('   Public Key:', treasuryKeypair.publicKey.toBase58());

  // Create keeper wallet (bot operations)
  const keeperKeypair = Keypair.generate();
  const keeperPrivateKey = bs58.encode(keeperKeypair.secretKey);
  console.log('\n🤖 Keeper Authority Wallet (bot operations):');
  console.log('   Public Key:', keeperKeypair.publicKey.toBase58());

  // Save keypairs for programmatic use
  fs.writeFileSync('/shared-artifacts/owner-keypair.json', JSON.stringify(Array.from(ownerKeypair.secretKey)));
  fs.writeFileSync('/shared-artifacts/treasury-keypair.json', JSON.stringify(Array.from(treasuryKeypair.secretKey)));
  fs.writeFileSync('/shared-artifacts/keeper-keypair.json', JSON.stringify(Array.from(keeperKeypair.secretKey)));

  // Create comprehensive recovery document with all formats
  const recoveryDoc = {
    "MIKO_TOKEN_WALLET_RECOVERY": {
      "NETWORK": "DEVNET",
      "CREATED": new Date().toISOString(),
      "CRITICAL": "SAVE THIS DOCUMENT SECURELY - CONTAINS ALL WALLET PRIVATE KEYS",
      
      "WALLETS": {
        "AUTHORITY": {
          "description": "Overall management and admin control (deployer)",
          "publicKey": deployerKeypair.publicKey.toBase58(),
          "privateKey_base58": deployerPrivateKey,
          "privateKey_array": Array.from(deployerKeypair.secretKey),
          "usage": [
            "Initialize programs",
            "Update configurations", 
            "Transfer authorities",
            "Emergency functions"
          ],
          "phantom_import": "Use private key (base58) in Phantom wallet import"
        },
        
        "OWNER": {
          "description": "Receives 20% of harvested tax as project revenue",
          "publicKey": ownerKeypair.publicKey.toBase58(),
          "privateKey_base58": ownerPrivateKey,
          "privateKey_array": Array.from(ownerKeypair.secretKey),
          "usage": [
            "Receives 20% of all tax distributions",
            "Project owner revenue wallet"
          ],
          "phantom_import": "Use private key (base58) in Phantom wallet import"
        },
        
        "TREASURY": {
          "description": "Holds 80% of harvested tax for distribution to holders",
          "publicKey": treasuryKeypair.publicKey.toBase58(),
          "privateKey_base58": treasuryPrivateKey,
          "privateKey_array": Array.from(treasuryKeypair.secretKey),
          "usage": [
            "Temporary holding of 80% harvested tax",
            "Source for holder reward distributions"
          ],
          "phantom_import": "Use private key (base58) in Phantom wallet import"
        },
        
        "KEEPER": {
          "description": "Bot wallet for automated operations",
          "publicKey": keeperKeypair.publicKey.toBase58(),
          "privateKey_base58": keeperPrivateKey,
          "privateKey_array": Array.from(keeperKeypair.secretKey),
          "usage": [
            "Harvest fees when 500k MIKO threshold reached",
            "Execute reward distributions to holders",
            "Update reward token on Mondays",
            "All automated operations"
          ],
          "phantom_import": "Use private key (base58) in Phantom wallet import"
        }
      },
      
      "CURRENT_MISCONFIGURATIONS": {
        "Vault": {
          "current_treasury": deployerKeypair.publicKey.toBase58() + " (WRONG - should be treasury wallet)",
          "current_ownerWallet": deployerKeypair.publicKey.toBase58() + " (WRONG - should be owner wallet)",
          "current_keeperAuthority": deployerKeypair.publicKey.toBase58() + " (WRONG but CANNOT be changed)"
        },
        "SmartDial": {
          "current_treasury": "CfSafnmD6aFHHsT5CtFVQ87YQzBMxCvvGjJtv8hH9GfP (UNKNOWN - should be owner wallet)"
        }
      },
      
      "REQUIRED_UPDATES": {
        "Vault_update_config": {
          "new_treasury": treasuryKeypair.publicKey.toBase58(),
          "new_ownerWallet": ownerKeypair.publicKey.toBase58()
        },
        "SmartDial_update_treasury": {
          "new_treasury": ownerKeypair.publicKey.toBase58() + " (must match Vault ownerWallet)"
        }
      },
      
      "HOW_TO_IMPORT_TO_PHANTOM": [
        "1. Open Phantom wallet",
        "2. Click menu (≡) → Add/Connect Wallet",
        "3. Select 'Import Private Key'",
        "4. Paste the privateKey_base58 value",
        "5. Name the wallet appropriately (e.g., 'MIKO Owner', 'MIKO Treasury', etc.)"
      ]
    }
  };

  const recoveryPath = '/shared-artifacts/MIKO_WALLET_RECOVERY.json';
  fs.writeFileSync(recoveryPath, JSON.stringify(recoveryDoc, null, 2));
  console.log('\n🔐 Full recovery document saved to:', recoveryPath);

  // Also save public info separately
  const publicInfo = {
    authority: {
      publicKey: deployerKeypair.publicKey.toBase58(),
      purpose: "Overall management and admin control"
    },
    owner: {
      publicKey: ownerKeypair.publicKey.toBase58(),
      purpose: "Receives 20% of harvested tax"
    },
    treasury: {
      publicKey: treasuryKeypair.publicKey.toBase58(),
      purpose: "Holds 80% of harvested tax for distribution"
    },
    keeper: {
      publicKey: keeperKeypair.publicKey.toBase58(),
      purpose: "Bot wallet for automated operations"
    },
    createdAt: new Date().toISOString()
  };

  const publicInfoPath = '/shared-artifacts/project-wallets.json';
  fs.writeFileSync(publicInfoPath, JSON.stringify(publicInfo, null, 2));

  console.log('\n⚠️  CRITICAL ACTIONS NEEDED:');
  console.log('1. SAVE /shared-artifacts/MIKO_WALLET_RECOVERY.json securely!');
  console.log('2. Update Vault config to use correct wallets');
  console.log('3. Update Smart Dial treasury to owner wallet');
  console.log('4. Import wallets to Phantom for manual control');
  
  console.log('\n✅ All wallet recovery information saved!');
}

main();