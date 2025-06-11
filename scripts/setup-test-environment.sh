#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 MIKO Token Test Environment Setup${NC}"
echo "======================================"

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"
command -v solana >/dev/null 2>&1 || { echo -e "${RED}Solana CLI is required but not installed.${NC}" >&2; exit 1; }
command -v anchor >/dev/null 2>&1 || { echo -e "${RED}Anchor CLI is required but not installed.${NC}" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo -e "${RED}Node.js is required but not installed.${NC}" >&2; exit 1; }

# Create test directory
TEST_DIR="$HOME/.miko-test"
mkdir -p $TEST_DIR
cd $TEST_DIR

echo -e "\n${YELLOW}Setting up test wallets...${NC}"

# Create test wallets
create_wallet() {
    local name=$1
    local path="$TEST_DIR/$name-test.json"
    
    if [ -f "$path" ]; then
        echo -e "${YELLOW}Wallet $name already exists, skipping...${NC}"
    else
        solana-keygen new -o "$path" --no-bip39-passphrase
        echo -e "${GREEN}Created wallet: $name${NC}"
    fi
    
    # Get pubkey
    local pubkey=$(solana-keygen pubkey "$path")
    echo "$name pubkey: $pubkey"
    
    # Export for later use
    export "${name}_PUBKEY"="$pubkey"
    export "${name}_PATH"="$path"
}

# Create all test wallets
create_wallet "deployer"
create_wallet "keeper-bot"
create_wallet "treasury"
create_wallet "owner"

# Create test holder wallets
echo -e "\n${YELLOW}Creating test holder wallets...${NC}"
for i in {1..5}; do
    create_wallet "holder$i"
done

# Set deployer as default
solana config set --keypair "$deployer_PATH"
solana config set --url devnet

echo -e "\n${YELLOW}Funding test wallets...${NC}"

# Fund wallets with devnet SOL
fund_wallet() {
    local path=$1
    local amount=$2
    local name=$3
    
    echo -e "Funding $name with $amount SOL..."
    solana airdrop $amount "$path" --url devnet || true
    sleep 2
}

fund_wallet "$deployer_PATH" 10 "deployer"
fund_wallet "$keeper_bot_PATH" 5 "keeper-bot"
fund_wallet "$treasury_PATH" 2 "treasury"
fund_wallet "$owner_PATH" 2 "owner"

# Fund holder wallets
for i in {1..5}; do
    fund_wallet "${TEST_DIR}/holder${i}-test.json" 1 "holder$i"
done

echo -e "\n${YELLOW}Creating test configuration...${NC}"

# Create test environment file
cat > "$TEST_DIR/test-env.sh" <<EOF
#!/bin/bash
# MIKO Token Test Environment Variables

# Test Wallets
export DEPLOYER_KEYPAIR="$deployer_PATH"
export KEEPER_BOT_KEYPAIR="$keeper_bot_PATH"
export TREASURY_KEYPAIR="$treasury_PATH"
export OWNER_KEYPAIR="$owner_PATH"

# Public Keys
export DEPLOYER_PUBKEY="$deployer_PUBKEY"
export KEEPER_BOT_PUBKEY="$keeper_bot_PUBKEY"
export TREASURY_PUBKEY="$treasury_PUBKEY"
export OWNER_PUBKEY="$owner_PUBKEY"

# Holder Public Keys
EOF

for i in {1..5}; do
    echo "export HOLDER${i}_PUBKEY=\"$(solana-keygen pubkey ${TEST_DIR}/holder${i}-test.json)\"" >> "$TEST_DIR/test-env.sh"
    echo "export HOLDER${i}_KEYPAIR=\"${TEST_DIR}/holder${i}-test.json\"" >> "$TEST_DIR/test-env.sh"
done

cat >> "$TEST_DIR/test-env.sh" <<EOF

# Network
export SOLANA_NETWORK="devnet"
export RPC_URL="https://api.devnet.solana.com"

# Test Mode
export TEST_MODE="true"
export NODE_ENV="test"

echo "Test environment loaded!"
echo "Wallets location: $TEST_DIR"
EOF

chmod +x "$TEST_DIR/test-env.sh"

# Create helper scripts
echo -e "\n${YELLOW}Creating helper scripts...${NC}"

# Balance check script
cat > "$TEST_DIR/check-balances.sh" <<'EOF'
#!/bin/bash
source "$(dirname "$0")/test-env.sh"

echo "Checking SOL balances..."
echo "======================"

check_balance() {
    local name=$1
    local pubkey=$2
    local balance=$(solana balance $pubkey --url devnet 2>/dev/null || echo "0")
    printf "%-15s %s SOL\n" "$name:" "$balance"
}

check_balance "Deployer" "$DEPLOYER_PUBKEY"
check_balance "Keeper Bot" "$KEEPER_BOT_PUBKEY"
check_balance "Treasury" "$TREASURY_PUBKEY"
check_balance "Owner" "$OWNER_PUBKEY"

echo ""
for i in {1..5}; do
    pubkey_var="HOLDER${i}_PUBKEY"
    check_balance "Holder $i" "${!pubkey_var}"
done
EOF

chmod +x "$TEST_DIR/check-balances.sh"

# Token distribution script
cat > "$TEST_DIR/distribute-tokens.sh" <<'EOF'
#!/bin/bash
source "$(dirname "$0")/test-env.sh"

if [ -z "$1" ]; then
    echo "Usage: $0 <token-mint>"
    exit 1
fi

TOKEN_MINT=$1
AMOUNT=${2:-100000}

echo "Distributing $AMOUNT tokens to each holder..."
echo "Token mint: $TOKEN_MINT"
echo "================================"

for i in {1..5}; do
    holder_var="HOLDER${i}_PUBKEY"
    holder_pubkey="${!holder_var}"
    
    echo "Transferring to Holder $i ($holder_pubkey)..."
    
    # Create ATA if needed
    spl-token create-account $TOKEN_MINT --owner $holder_pubkey --fee-payer $DEPLOYER_KEYPAIR 2>/dev/null || true
    
    # Transfer tokens
    spl-token transfer $TOKEN_MINT $AMOUNT $holder_pubkey \
        --from $TREASURY_KEYPAIR \
        --fee-payer $DEPLOYER_KEYPAIR \
        --url devnet
done

echo "Distribution complete!"
EOF

chmod +x "$TEST_DIR/distribute-tokens.sh"

# Create test runner script
cat > "$TEST_DIR/run-test-cycle.sh" <<'EOF'
#!/bin/bash
source "$(dirname "$0")/test-env.sh"

echo "Running MIKO Token Test Cycle"
echo "============================="

# Function to check if keeper bot is running
check_keeper_bot() {
    curl -s http://localhost:3000/health > /dev/null 2>&1
    return $?
}

# 1. Check keeper bot
echo -e "\n1. Checking keeper bot..."
if check_keeper_bot; then
    echo "✅ Keeper bot is running"
else
    echo "❌ Keeper bot is not running"
    echo "Please start the keeper bot first: npm run dev"
    exit 1
fi

# 2. Check balances
echo -e "\n2. Checking balances..."
$TEST_DIR/check-balances.sh

# 3. Trigger reward check
echo -e "\n3. Triggering reward token check..."
curl -X POST http://localhost:3000/test/trigger-reward-check

# 4. Wait for processing
echo -e "\n4. Waiting for processing..."
sleep 5

# 5. Trigger distribution
echo -e "\n5. Triggering reward distribution..."
curl -X POST http://localhost:3000/test/trigger-distribution

# 6. Check results
echo -e "\n6. Checking results..."
curl http://localhost:3000/test/last-distribution

echo -e "\n✅ Test cycle complete!"
EOF

chmod +x "$TEST_DIR/run-test-cycle.sh"

echo -e "\n${GREEN}✅ Test environment setup complete!${NC}"
echo -e "\n${BLUE}Test wallet locations:${NC}"
echo "  Directory: $TEST_DIR"
echo "  Environment: source $TEST_DIR/test-env.sh"
echo ""
echo -e "${BLUE}Helper scripts:${NC}"
echo "  Check balances: $TEST_DIR/check-balances.sh"
echo "  Distribute tokens: $TEST_DIR/distribute-tokens.sh <mint> [amount]"
echo "  Run test cycle: $TEST_DIR/run-test-cycle.sh"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Source the test environment: source $TEST_DIR/test-env.sh"
echo "2. Deploy programs using these test wallets"
echo "3. Start the keeper bot in test mode"
echo "4. Run test cycles with the helper scripts"