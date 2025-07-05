#!/bin/bash

# Deploy Smart Dial Program to Devnet

echo "🚀 Deploying Smart Dial Program..."
echo "================================="

# Set colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "Anchor.toml" ]; then
    echo -e "${RED}Error: Must run from project root directory${NC}"
    exit 1
fi

# Build the Smart Dial program
echo "📦 Building Smart Dial program..."
anchor build --program-name smart_dial

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful${NC}"

# Deploy to devnet
echo "🌐 Deploying to devnet..."
anchor deploy --program-name smart_dial --provider.cluster devnet

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Smart Dial program deployed successfully!${NC}"

# Get the deployed program ID
PROGRAM_ID=$(solana address -k target/deploy/smart_dial-keypair.json)
echo "📋 Program ID: $PROGRAM_ID"

# Update the declare_id in the program
echo "📝 Updating program ID in source..."
sed -i "s/Dia11111111111111111111111111111111111111111/$PROGRAM_ID/g" programs/smart-dial/src/lib.rs

# Update Anchor.toml with the actual program ID
sed -i "s/smart_dial = \"Dia11111111111111111111111111111111111111111\"/smart_dial = \"$PROGRAM_ID\"/g" Anchor.toml

echo -e "${GREEN}✅ Program ID updated${NC}"
echo ""
echo "Next steps:"
echo "1. Initialize the Smart Dial with: npm run init-smart-dial"
echo "2. The program is ready to store reward token configurations"
echo "3. The keeper bot will update it weekly based on AI selections"