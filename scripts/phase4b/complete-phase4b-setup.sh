#!/bin/bash
set -e

echo "=================================================="
echo "   PHASE 4-B COMPLETE SETUP (PHASES 1-3)"
echo "=================================================="
echo ""
echo "This script will:"
echo "1. Deploy programs (Phase 1)"
echo "2. Create MIKO token with transfer fee (Phase 2)" 
echo "3. Initialize Vault and Smart Dial"
echo "4. Create proper wallet structure (owner, treasury, keeper)"
echo "5. Update configurations to use correct wallets"
echo "6. Transfer token authorities to Vault PDA"
echo "7. Revoke mint authority"
echo "8. Set up keeper bot configuration"
echo ""

# Check if mainnet fork is running
if ! curl -s http://127.0.0.1:8899 > /dev/null; then
    echo "❌ Mainnet fork is not running! Start it first with ./start-mainnet-fork.sh"
    exit 1
fi

echo "✅ Mainnet fork with ALT support detected"
echo ""

# ============================================
# PHASE 1: PROGRAM DEPLOYMENT
# ============================================
echo "=== PHASE 1: PROGRAM DEPLOYMENT ==="
echo ""

# Generate keypairs
echo "Generating keypairs..."
solana-keygen new --no-bip39-passphrase --silent --outfile phase4b-vault-keypair.json
solana-keygen new --no-bip39-passphrase --silent --outfile phase4b-smartdial-keypair.json
solana-keygen new --no-bip39-passphrase --silent --outfile phase4b-deployer.json
solana-keygen new --no-bip39-passphrase --silent --outfile phase4b-mint-keypair.json

VAULT_ADDRESS=$(solana-keygen pubkey phase4b-vault-keypair.json)
SMARTDIAL_ADDRESS=$(solana-keygen pubkey phase4b-smartdial-keypair.json)
DEPLOYER_ADDRESS=$(solana-keygen pubkey phase4b-deployer.json)
MINT_ADDRESS=$(solana-keygen pubkey phase4b-mint-keypair.json)

echo "Program addresses:"
echo "- Vault: $VAULT_ADDRESS"
echo "- Smart Dial: $SMARTDIAL_ADDRESS"
echo "- Deployer: $DEPLOYER_ADDRESS"

# Airdrop SOL
echo ""
echo "Airdropping SOL to deployer..."
solana airdrop 100 $DEPLOYER_ADDRESS -u http://127.0.0.1:8899
sleep 2

# Update and build programs
echo ""
echo "Building programs..."
cd phase4b-programs
sed -i "s/declare_id!(\".*\");/declare_id!(\"$VAULT_ADDRESS\");/" programs/absolute-vault/src/lib.rs
sed -i "s/declare_id!(\".*\");/declare_id!(\"$SMARTDIAL_ADDRESS\");/" programs/smart-dial/src/lib.rs
anchor build

# Deploy programs
echo ""
echo "Deploying programs..."
solana program deploy \
    --url http://127.0.0.1:8899 \
    --keypair ../phase4b-deployer.json \
    --program-id ../phase4b-vault-keypair.json \
    target/deploy/absolute_vault.so

solana program deploy \
    --url http://127.0.0.1:8899 \
    --keypair ../phase4b-deployer.json \
    --program-id ../phase4b-smartdial-keypair.json \
    target/deploy/smart_dial.so

cd ..

echo "✅ Phase 1 complete: Programs deployed"
echo ""

# ============================================
# PHASE 2: TOKEN CREATION
# ============================================
echo "=== PHASE 2: TOKEN CREATION ==="
echo ""

# Create config for token creation
cat > phase4b-config.json <<EOF
{
  "programs": {
    "vault": "$VAULT_ADDRESS",
    "smartDial": "$SMARTDIAL_ADDRESS"
  },
  "deployer": "$DEPLOYER_ADDRESS"
}
EOF

echo "Creating MIKO Token-2022 with transfer fee..."
npx ts-node create-phase4b-token.ts

# Read the created token address
MIKO_TOKEN=$(jq -r '.mikoToken' phase4b-config.json)
echo "✅ Phase 2 complete: MIKO token created at $MIKO_TOKEN"
echo ""

# ============================================
# PHASE 3: INITIALIZATION & CONFIGURATION
# ============================================
echo "=== PHASE 3: INITIALIZATION & CONFIGURATION ==="
echo ""

# Step 1: Initialize programs
echo "Step 1: Initializing Vault and Smart Dial..."
npx ts-node initialize-phase4b-programs.ts
echo "✅ Programs initialized"
echo ""

# Step 2: Create proper wallet structure
echo "Step 2: Creating wallet structure (owner, treasury, keeper)..."
npx ts-node create-phase4b-wallets.ts
echo "✅ Wallets created"
echo ""

# Step 3: Update Vault configuration
echo "Step 3: Updating Vault configuration with proper wallets..."
npx ts-node update-vault-config.ts
echo "✅ Vault configuration updated"
echo ""

# Step 4: Update Smart Dial treasury
echo "Step 4: Updating Smart Dial treasury..."
npx ts-node update-smart-dial-treasury.ts
echo "✅ Smart Dial treasury updated"
echo ""

# Step 5: Transfer authorities to Vault PDA
echo "Step 5: Transferring token authorities to Vault PDA..."
npx ts-node transfer-authorities-to-vault.ts
echo "✅ Authorities transferred"
echo ""

# Step 6: Revoke mint authority
echo "Step 6: Revoking mint authority permanently..."
npx ts-node revoke-mint-authority.ts
echo "✅ Mint authority revoked"
echo ""

# Step 7: Configure keeper bot
echo "Step 7: Setting up keeper bot configuration..."
cat > keeper-bot-config-phase4b.json <<EOF
{
  "network": "mainnet-fork",
  "rpcUrl": "http://127.0.0.1:8899",
  "programs": {
    "vault": "$VAULT_ADDRESS",
    "smartDial": "$SMARTDIAL_ADDRESS"
  },
  "mikoToken": "$MIKO_TOKEN",
  "harvestThreshold": 500000,
  "distributionEngineVersion": "v2",
  "features": {
    "rollover": true,
    "emergencyWithdraw": true,
    "autoFeeUpdate": true
  }
}
EOF
echo "✅ Keeper bot configured"
echo ""

# ============================================
# VERIFICATION
# ============================================
echo "=== VERIFICATION ==="
echo ""

# Load wallet info
OWNER_WALLET=$(jq -r '.wallets.owner.publicKey' phase4b-wallet-recovery.json)
TREASURY_WALLET=$(jq -r '.wallets.treasury.publicKey' phase4b-wallet-recovery.json)
KEEPER_WALLET=$(jq -r '.wallets.keeper.publicKey' phase4b-wallet-recovery.json)

echo "Final configuration:"
echo "- Vault Program: $VAULT_ADDRESS"
echo "- Smart Dial Program: $SMARTDIAL_ADDRESS"
echo "- MIKO Token: $MIKO_TOKEN"
echo "- Deployer/Authority: $DEPLOYER_ADDRESS"
echo "- Owner Wallet: $OWNER_WALLET"
echo "- Treasury Wallet: $TREASURY_WALLET"
echo "- Keeper Wallet: $KEEPER_WALLET"
echo ""

# Check token authorities
echo "Checking token authorities..."
AUTH_CHECK=$(spl-token display $MIKO_TOKEN -u http://127.0.0.1:8899 --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb 2>&1 || true)
echo "$AUTH_CHECK" | grep -E "(Mint authority|Transfer fee config authority|Withdraw withheld authority)" || true
echo ""

# Save complete configuration
cat > phase4b-complete-config.json <<EOF
{
  "deployment": "phase4b-complete-with-alts",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "phase": "ready-for-launch",
  "programs": {
    "vault": "$VAULT_ADDRESS",
    "smartDial": "$SMARTDIAL_ADDRESS"
  },
  "token": {
    "mint": "$MIKO_TOKEN",
    "decimals": 9,
    "supply": "1000000000",
    "transferFee": {
      "initial": "30%",
      "after5min": "15%",
      "after10min": "5%"
    }
  },
  "wallets": {
    "deployer": "$DEPLOYER_ADDRESS",
    "owner": "$OWNER_WALLET",
    "treasury": "$TREASURY_WALLET",
    "keeper": "$KEEPER_WALLET"
  },
  "authorities": {
    "mintAuthority": "null (revoked)",
    "transferFeeConfig": "Vault PDA",
    "withdrawWithheld": "Vault PDA"
  },
  "altSupport": true,
  "readyForLaunch": true
}
EOF

echo "=================================================="
echo "   COMPLETE PHASE 1-3 SETUP FINISHED"
echo "=================================================="
echo ""
echo "✅ All phases completed successfully!"
echo "✅ Architecture matches production setup"
echo "✅ Ready for launch coordinator testing"
echo ""
echo "Next step: npx ts-node launch-coordinator-final.ts test"