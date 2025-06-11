#!/bin/bash
set -e

echo "🚀 Safe MIKO Token Programs Deployment"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check current balance first
echo -e "${YELLOW}Current balance:${NC}"
solana balance

# Ask for confirmation
echo -e "${RED}⚠️  WARNING: This will deploy programs to devnet.${NC}"
echo -e "${YELLOW}Make sure you have sufficient SOL balance.${NC}"
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Deploy programs using the keypair files directly
echo -e "${YELLOW}Deploying programs with program keypairs...${NC}"

# First, let's check if we have program keypairs
if [ ! -f "target/deploy/absolute_vault-keypair.json" ]; then
    echo -e "${RED}Error: Program keypair not found at target/deploy/absolute_vault-keypair.json${NC}"
    echo -e "${YELLOW}Generating new program keypair...${NC}"
    solana-keygen new -o target/deploy/absolute_vault-keypair.json --no-bip39-passphrase
fi

if [ ! -f "target/deploy/smart_dial-keypair.json" ]; then
    echo -e "${RED}Error: Program keypair not found at target/deploy/smart_dial-keypair.json${NC}"
    echo -e "${YELLOW}Generating new program keypair...${NC}"
    solana-keygen new -o target/deploy/smart_dial-keypair.json --no-bip39-passphrase
fi

# Deploy Absolute Vault
echo -e "${YELLOW}Deploying Absolute Vault program...${NC}"
echo -e "${YELLOW}This will take some time. Please be patient...${NC}"

ABSOLUTE_VAULT_ID=$(solana-keygen pubkey target/deploy/absolute_vault-keypair.json)
echo -e "${YELLOW}Expected Program ID: $ABSOLUTE_VAULT_ID${NC}"

# Deploy with single transaction approach
solana program deploy \
    --program-id target/deploy/absolute_vault-keypair.json \
    target/deploy/absolute_vault.so

echo -e "${GREEN}✅ Absolute Vault deployed: $ABSOLUTE_VAULT_ID${NC}"

# Check balance after first deployment
echo -e "${YELLOW}Remaining balance:${NC}"
solana balance

# Ask before deploying second program
read -p "Deploy Smart Dial program? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Skipping Smart Dial deployment${NC}"
    exit 0
fi

# Deploy Smart Dial
echo -e "${YELLOW}Deploying Smart Dial program...${NC}"
echo -e "${YELLOW}This will take some time. Please be patient...${NC}"

SMART_DIAL_ID=$(solana-keygen pubkey target/deploy/smart_dial-keypair.json)
echo -e "${YELLOW}Expected Program ID: $SMART_DIAL_ID${NC}"

solana program deploy \
    --program-id target/deploy/smart_dial-keypair.json \
    target/deploy/smart_dial.so

echo -e "${GREEN}✅ Smart Dial deployed: $SMART_DIAL_ID${NC}"

# Save deployment info
cat > deployed-programs.json <<EOF
{
  "network": "devnet",
  "programs": {
    "absolute_vault": "$ABSOLUTE_VAULT_ID",
    "smart_dial": "$SMART_DIAL_ID"
  },
  "deployedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

# Update Anchor.toml
sed -i "s/absolute_vault = \".*\"/absolute_vault = \"$ABSOLUTE_VAULT_ID\"/" Anchor.toml
sed -i "s/smart_dial = \".*\"/smart_dial = \"$SMART_DIAL_ID\"/" Anchor.toml

echo -e "${GREEN}✅ All deployments complete!${NC}"
echo -e "${GREEN}Absolute Vault: $ABSOLUTE_VAULT_ID${NC}"
echo -e "${GREEN}Smart Dial: $SMART_DIAL_ID${NC}"

# Show final balance
echo -e "${YELLOW}Final balance:${NC}"
solana balance