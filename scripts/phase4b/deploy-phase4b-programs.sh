#!/bin/bash
set -e

echo "====================================="
echo "PHASE 4-B PROGRAM DEPLOYMENT"
echo "====================================="
echo ""

# Check if fork is running
FORK_URL="http://127.0.0.1:8899"
if ! solana cluster-version --url $FORK_URL 2>/dev/null; then
    echo "ERROR: Local fork not running!"
    echo "Please run: ./start-mainnet-fork.sh"
    exit 1
fi

# Navigate to phase4b directory
cd /home/humiccoils/git/miko_token/scripts/phase4b

# Create deployer keypair for Phase 4-B
DEPLOYER_KEYPAIR="phase4b-deployer.json"
if [ ! -f $DEPLOYER_KEYPAIR ]; then
    echo "Creating Phase 4-B deployer..."
    solana-keygen new --no-bip39-passphrase --silent --outfile $DEPLOYER_KEYPAIR
fi

DEPLOYER_ADDRESS=$(solana-keygen pubkey $DEPLOYER_KEYPAIR)
echo "Phase 4-B Deployer: $DEPLOYER_ADDRESS"

# Fund deployer
echo -e "\nFunding deployer with fake SOL..."
solana airdrop 100 $DEPLOYER_ADDRESS --url $FORK_URL

# Deploy programs
echo -e "\nDeploying Vault program..."
solana program deploy \
    --url $FORK_URL \
    --keypair $DEPLOYER_KEYPAIR \
    --program-id phase4b-programs/vault-phase4b.json \
    phase4b-programs/target/deploy/absolute_vault.so

echo -e "\nDeploying Smart Dial program..."
solana program deploy \
    --url $FORK_URL \
    --keypair $DEPLOYER_KEYPAIR \
    --program-id phase4b-programs/smartdial-phase4b.json \
    phase4b-programs/target/deploy/smart_dial.so

# Create MIKO token for Phase 4-B
echo -e "\nCreating Phase 4-B MIKO token..."
ts-node create-phase4b-token.ts

echo -e "\n====================================="
echo "PHASE 4-B DEPLOYMENT COMPLETE!"
echo "====================================="
echo ""
echo "Configuration saved to: phase4b-config.json"
echo ""
echo "Next steps:"
echo "1. Initialize Vault and Smart Dial programs"
echo "2. Run launch sequence tests"
echo "3. Test fee transitions and keeper bot"