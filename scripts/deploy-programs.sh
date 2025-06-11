#!/bin/bash
set -e

echo "🚀 Starting MIKO Token Programs Deployment"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if required tools are installed
command -v anchor >/dev/null 2>&1 || { echo -e "${RED}Anchor CLI is required but not installed.${NC}" >&2; exit 1; }
command -v solana >/dev/null 2>&1 || { echo -e "${RED}Solana CLI is required but not installed.${NC}" >&2; exit 1; }

# Parse command line arguments
NETWORK=${1:-devnet}
SKIP_BUILD=${2:-false}

echo "Network: $NETWORK"

# Set cluster
echo -e "${YELLOW}Setting Solana cluster to $NETWORK...${NC}"
solana config set --url $NETWORK

# Build programs if not skipped
if [ "$SKIP_BUILD" != "true" ]; then
    echo -e "${YELLOW}Building programs...${NC}"
    anchor build
else
    echo -e "${YELLOW}Skipping build...${NC}"
fi

# Deploy programs
echo -e "${YELLOW}Deploying Absolute Vault program...${NC}"
ABSOLUTE_VAULT_ID=$(anchor deploy --program-name absolute_vault --provider.cluster $NETWORK | grep "Program Id:" | awk '{print $3}')
echo -e "${GREEN}Absolute Vault deployed: $ABSOLUTE_VAULT_ID${NC}"

echo -e "${YELLOW}Deploying Smart Dial program...${NC}"
SMART_DIAL_ID=$(anchor deploy --program-name smart_dial --provider.cluster $NETWORK | grep "Program Id:" | awk '{print $3}')
echo -e "${GREEN}Smart Dial deployed: $SMART_DIAL_ID${NC}"

# Update Anchor.toml with deployed program IDs
echo -e "${YELLOW}Updating Anchor.toml with program IDs...${NC}"
sed -i "s/absolute_vault = \".*\"/absolute_vault = \"$ABSOLUTE_VAULT_ID\"/" Anchor.toml
sed -i "s/smart_dial = \".*\"/smart_dial = \"$SMART_DIAL_ID\"/" Anchor.toml

# Save program IDs to a file for reference
echo -e "${YELLOW}Saving program IDs...${NC}"
cat > deployed-programs.json <<EOF
{
  "network": "$NETWORK",
  "programs": {
    "absolute_vault": "$ABSOLUTE_VAULT_ID",
    "smart_dial": "$SMART_DIAL_ID"
  },
  "deployedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "${GREEN}Absolute Vault: $ABSOLUTE_VAULT_ID${NC}"
echo -e "${GREEN}Smart Dial: $SMART_DIAL_ID${NC}"

# Reminder for mainnet deployment
if [ "$NETWORK" == "mainnet-beta" ]; then
    echo -e "${RED}⚠️  IMPORTANT: Remember to burn upgrade authority for mainnet deployment!${NC}"
    echo -e "${YELLOW}Run the following commands:${NC}"
    echo "solana program set-upgrade-authority $ABSOLUTE_VAULT_ID --new-upgrade-authority 11111111111111111111111111111111"
    echo "solana program set-upgrade-authority $SMART_DIAL_ID --new-upgrade-authority 11111111111111111111111111111111"
fi