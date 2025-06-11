#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${RED}⚠️  MIKO Token Production Setup Checklist ⚠️${NC}"
echo "==========================================="
echo -e "${RED}This is for MAINNET deployment. Proceed with extreme caution!${NC}"
echo ""

# Function to confirm critical steps
confirm_step() {
    local step="$1"
    echo -e "\n${YELLOW}$step${NC}"
    echo -n "Completed? (yes/no): "
    read response
    if [ "$response" != "yes" ]; then
        echo -e "${RED}Step not completed. Aborting.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Confirmed${NC}"
}

# Pre-deployment checklist
echo -e "\n${BLUE}=== Pre-Deployment Checklist ===${NC}"

confirm_step "1. Code has been audited by a reputable firm"
confirm_step "2. All tests pass on devnet"
confirm_step "3. Security review completed"
confirm_step "4. Legal compliance verified"
confirm_step "5. Insurance coverage obtained"
confirm_step "6. Incident response plan documented"
confirm_step "7. Team trained on emergency procedures"

# Wallet setup
echo -e "\n${BLUE}=== Wallet Security Setup ===${NC}"

confirm_step "8. Hardware wallet (Ledger) configured for deployer"
confirm_step "9. Multisig wallets created for treasury and owner"
confirm_step "10. All wallet addresses documented securely"
confirm_step "11. Backup procedures tested"

# API and infrastructure
echo -e "\n${BLUE}=== Infrastructure Setup ===${NC}"

confirm_step "12. Production RPC endpoint configured"
confirm_step "13. Production API keys obtained (Birdeye, Twitter)"
confirm_step "14. Monitoring infrastructure deployed"
confirm_step "15. Alert channels configured"
confirm_step "16. Backup systems tested"

# Final confirmations
echo -e "\n${BLUE}=== Final Confirmations ===${NC}"

echo -e "${YELLOW}Enter production wallet addresses:${NC}"
echo -n "Keeper Bot Public Key: "
read KEEPER_BOT_PUBKEY
echo -n "Treasury Wallet (multisig): "
read TREASURY_WALLET
echo -n "Owner Wallet (multisig): "
read OWNER_WALLET

# Validate addresses
validate_address() {
    local addr=$1
    if [[ ! "$addr" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]]; then
        echo -e "${RED}Invalid Solana address: $addr${NC}"
        exit 1
    fi
}

validate_address "$KEEPER_BOT_PUBKEY"
validate_address "$TREASURY_WALLET"
validate_address "$OWNER_WALLET"

# Create production config file
PROD_DIR="$HOME/.miko-production"
mkdir -p "$PROD_DIR"

cat > "$PROD_DIR/production-config.json" <<EOF
{
  "network": "mainnet-beta",
  "wallets": {
    "keeperBot": "$KEEPER_BOT_PUBKEY",
    "treasury": "$TREASURY_WALLET",
    "owner": "$OWNER_WALLET"
  },
  "created": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "checklist": {
    "audit": true,
    "testing": true,
    "security": true,
    "legal": true,
    "insurance": true,
    "incidentResponse": true,
    "teamTraining": true,
    "hardwareWallet": true,
    "multisig": true,
    "backups": true,
    "monitoring": true
  }
}
EOF

# Create deployment script
cat > "$PROD_DIR/deploy-production.sh" <<'EOF'
#!/bin/bash
set -e

# THIS SCRIPT WILL DEPLOY TO MAINNET
# DOUBLE CHECK EVERYTHING BEFORE RUNNING

echo "⚠️  MAINNET DEPLOYMENT SCRIPT ⚠️"
echo "================================"
echo ""
echo "This will deploy to Solana Mainnet."
echo "Make sure you have:"
echo "- Connected your hardware wallet"
echo "- Verified all addresses"
echo "- Completed all checklist items"
echo ""
echo "Type 'DEPLOY TO MAINNET' to continue:"
read confirmation

if [ "$confirmation" != "DEPLOY TO MAINNET" ]; then
    echo "Deployment cancelled."
    exit 1
fi

# Load config
CONFIG_FILE="$HOME/.miko-production/production-config.json"
KEEPER_BOT=$(jq -r '.wallets.keeperBot' $CONFIG_FILE)
TREASURY=$(jq -r '.wallets.treasury' $CONFIG_FILE)
OWNER=$(jq -r '.wallets.owner' $CONFIG_FILE)

echo "Using addresses:"
echo "Keeper Bot: $KEEPER_BOT"
echo "Treasury: $TREASURY"
echo "Owner: $OWNER"
echo ""
echo "Last chance to abort. Press Ctrl+C now or Enter to continue..."
read

# Deploy programs
echo "Deploying programs..."
./scripts/deploy-programs.sh mainnet-beta

echo ""
echo "Programs deployed. Program IDs saved to deployed-programs.json"
echo ""
echo "Next steps:"
echo "1. Initialize programs with production wallets"
echo "2. Create MIKO token"
echo "3. CRITICAL: Burn upgrade authority"
echo "4. Deploy and start keeper bot"
echo ""
echo "Remember: Burning upgrade authority is IRREVERSIBLE!"
EOF

chmod +x "$PROD_DIR/deploy-production.sh"

# Create post-deployment script
cat > "$PROD_DIR/post-deployment-tasks.sh" <<'EOF'
#!/bin/bash

echo "Post-Deployment Tasks"
echo "===================="
echo ""
echo "[ ] 1. Verify all program deployments"
echo "[ ] 2. Initialize programs"
echo "[ ] 3. Create and verify MIKO token"
echo "[ ] 4. Burn upgrade authority (IRREVERSIBLE)"
echo "[ ] 5. Deploy keeper bot"
echo "[ ] 6. Verify monitoring"
echo "[ ] 7. Test small transaction"
echo "[ ] 8. Announce deployment"
echo "[ ] 9. Monitor for 24 hours"
echo "[ ] 10. Complete post-mortem"
EOF

chmod +x "$PROD_DIR/post-deployment-tasks.sh"

echo -e "\n${GREEN}✅ Production setup checklist complete!${NC}"
echo ""
echo -e "${BLUE}Production files created:${NC}"
echo "  Config: $PROD_DIR/production-config.json"
echo "  Deploy: $PROD_DIR/deploy-production.sh"
echo "  Tasks: $PROD_DIR/post-deployment-tasks.sh"
echo ""
echo -e "${YELLOW}⚠️  CRITICAL REMINDERS:${NC}"
echo "1. Use hardware wallet for all operations"
echo "2. Double-check all addresses"
echo "3. Burning upgrade authority is IRREVERSIBLE"
echo "4. Have incident response team on standby"
echo "5. Monitor continuously after deployment"
echo ""
echo -e "${RED}This is real money. Be careful!${NC}"