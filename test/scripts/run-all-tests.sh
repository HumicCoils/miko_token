#!/bin/bash

# MIKO Token Devnet Test Runner
# This script runs all test scenarios sequentially

set -e

echo "======================================"
echo "MIKO Token Devnet Test Suite"
echo "======================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env.test exists
if [ ! -f ".env.test" ]; then
    echo -e "${RED}Error: .env.test not found${NC}"
    echo "Please create .env.test with your configuration"
    exit 1
fi

# Load environment
export $(cat .env.test | xargs)

echo -e "\n${YELLOW}Step 1: Creating test token...${NC}"
ts-node scripts/create-test-token.ts
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Token created successfully${NC}"
else
    echo -e "${RED}✗ Token creation failed${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Step 2: Minting to test wallets...${NC}"
ts-node scripts/mint-to-test-wallets.ts
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Tokens minted successfully${NC}"
else
    echo -e "${RED}✗ Minting failed${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Step 3: Setting up exclusions...${NC}"
ts-node scripts/setup-exclusions.ts
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Exclusions configured${NC}"
else
    echo -e "${RED}✗ Exclusion setup failed${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Step 4: Generating test transactions...${NC}"
ts-node scripts/generate-test-transactions.ts
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Test transactions generated${NC}"
else
    echo -e "${RED}✗ Transaction generation failed${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Step 5: Starting keeper bot in background...${NC}"
cd keeper-bot
ts-node ../test/keeper-bot/src/index.test.ts &
KEEPER_PID=$!
cd ..
sleep 5

if ps -p $KEEPER_PID > /dev/null; then
    echo -e "${GREEN}✓ Keeper bot started (PID: $KEEPER_PID)${NC}"
else
    echo -e "${RED}✗ Keeper bot failed to start${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Step 6: Monitoring tax distribution...${NC}"
echo "Running for 2 minutes to observe tax collection..."
timeout 120s ts-node scripts/monitor-tax-distribution.ts || true

echo -e "\n${YELLOW}Step 7: Checking results...${NC}"

# Check if treasury has balance
TREASURY_BALANCE=$(spl-token balance --owner $TREASURY_WALLET --url devnet 2>/dev/null || echo "0")
if [ "$TREASURY_BALANCE" != "0" ]; then
    echo -e "${GREEN}✓ Treasury received tax (Balance: $TREASURY_BALANCE)${NC}"
else
    echo -e "${RED}✗ No treasury balance found${NC}"
fi

# Check keeper bot health
HEALTH_CHECK=$(curl -s http://localhost:3000/health || echo "failed")
if [[ $HEALTH_CHECK == *"ok"* ]]; then
    echo -e "${GREEN}✓ Keeper bot is healthy${NC}"
else
    echo -e "${RED}✗ Keeper bot health check failed${NC}"
fi

echo -e "\n${YELLOW}Cleaning up...${NC}"
kill $KEEPER_PID 2>/dev/null || true

echo -e "\n======================================"
echo -e "${GREEN}Test suite completed!${NC}"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Review the logs above for any issues"
echo "2. Check account balances manually if needed"
echo "3. Run production version testing when ready"