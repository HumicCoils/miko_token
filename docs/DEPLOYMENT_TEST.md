# MIKO Token - Test Environment Deployment Guide

This guide covers deploying and testing the MIKO Token system on Solana Devnet.

## Prerequisites

- Solana CLI configured for devnet
- Test wallets with devnet SOL (use `solana airdrop`)
- All dependencies installed

## 1. Test Wallet Setup

### Create Test Wallets
```bash
# Create deployer wallet
solana-keygen new -o ~/.config/solana/deployer-test.json

# Create keeper bot wallet
solana-keygen new -o ~/.config/solana/keeper-bot-test.json

# Create treasury wallet
solana-keygen new -o ~/.config/solana/treasury-test.json

# Create owner wallet
solana-keygen new -o ~/.config/solana/owner-test.json

# Set deployer as default
solana config set --keypair ~/.config/solana/deployer-test.json
```

### Fund Test Wallets
```bash
# Airdrop SOL to all wallets
solana airdrop 10 ~/.config/solana/deployer-test.json
solana airdrop 5 ~/.config/solana/keeper-bot-test.json
solana airdrop 2 ~/.config/solana/treasury-test.json
solana airdrop 2 ~/.config/solana/owner-test.json
```

## 2. Deploy Smart Contracts to Devnet

### Build Programs
```bash
# From project root
# Use cargo build-sbf directly due to toolchain compatibility
cd programs/absolute-vault && cargo build-sbf
cd ../smart-dial && cargo build-sbf
cd ../..

# Alternative: If you have anchor 0.29.0 installed globally:
# anchor build --skip-lint
```

### Deploy Programs
```bash
# Deploy to devnet
./scripts/deploy-programs.sh devnet

# Note the program IDs from output
# Example output:
# Absolute Vault: DVCp3VkH8JNr9KszQGxDgbNMfQVq3b5kZUXxBTqpumF
# Smart Dial: SDia8K3Vdnw2FKjLbQTQGxDgbNMfQVq3b5kZUX9
```

### Initialize Programs
```bash
# Export test wallet addresses
export KEEPER_BOT_PUBKEY=$(solana-keygen pubkey ~/.config/solana/keeper-bot-test.json)
export TREASURY_WALLET=$(solana-keygen pubkey ~/.config/solana/treasury-test.json)
export OWNER_WALLET=$(solana-keygen pubkey ~/.config/solana/owner-test.json)

# Initialize programs
ts-node scripts/initialize-programs.ts
```

## 3. Create Test MIKO Token

### Set Environment Variables
```bash
# Create test environment file
cat > scripts/.env.test <<EOF
RPC_URL=https://api.devnet.solana.com
PAYER_KEYPAIR_PATH=$HOME/.config/solana/deployer-test.json
ABSOLUTE_VAULT_PROGRAM_ID=<YOUR_ABSOLUTE_VAULT_ID>
TREASURY_WALLET=$(solana-keygen pubkey ~/.config/solana/treasury-test.json)
EOF
```

### Create Token
```bash
cd scripts
ts-node create-token.ts

# Example output:
# Creating MIKO token with the following configuration:
# Mint address: TKNmiko8K3Vdnw2FKjLbQTQGxDgbNMfQVq3b5kZUX
# Decimals: 9
# Total supply: 1000000000
# Transfer fee: 5%
```

### Save Token Mint
```bash
# Add to environment
export MIKO_TOKEN_MINT=<YOUR_TOKEN_MINT_ADDRESS>
```

## 4. Configure and Run Keeper Bot (Test Mode)

### Create Test Configuration
```bash
cd keeper-bot

# Create test environment file
cat > .env.test <<EOF
# API Keys (test keys)
BIRDEYE_API_KEY=test_birdeye_key_here
TWITTER_BEARER_TOKEN=test_twitter_token_here

# Solana Configuration
RPC_URL=https://api.devnet.solana.com
KEEPER_BOT_KEY=$(cat ~/.config/solana/keeper-bot-test.json | base64 -w 0)

# Program IDs
ABSOLUTE_VAULT_PROGRAM_ID=$ABSOLUTE_VAULT_PROGRAM_ID
SMART_DIAL_PROGRAM_ID=$SMART_DIAL_PROGRAM_ID
MIKO_TOKEN_MINT=$MIKO_TOKEN_MINT

# Test Environment Settings
NODE_ENV=development
LOG_LEVEL=debug

# Faster intervals for testing (in ms)
REWARD_CHECK_INTERVAL_MS=60000      # 1 minute
REWARD_DISTRIBUTION_INTERVAL_MS=30000 # 30 seconds
HOLDER_UPDATE_INTERVAL_MS=120000     # 2 minutes

# Monitoring
HEALTH_CHECK_PORT=3000
METRICS_PORT=9090
EOF
```

### Run Keeper Bot Locally
```bash
# Install dependencies
npm install

# Run in development mode with hot reload
npm run dev

# In another terminal, check health
curl http://localhost:3000/health
```

## 5. Testing Procedures

### Test Token Creation and Tax
```bash
# Create test holder accounts and transfer tokens
# This will trigger the 5% tax

# 1. Create a test holder wallet
solana-keygen new -o ~/.config/solana/holder1-test.json
solana airdrop 1 ~/.config/solana/holder1-test.json

# 2. Create associated token account
spl-token create-account $MIKO_TOKEN_MINT \
  --owner ~/.config/solana/holder1-test.json \
  --fee-payer ~/.config/solana/deployer-test.json

# 3. Transfer tokens (will incur 5% tax)
spl-token transfer $MIKO_TOKEN_MINT 1000 \
  $(solana-keygen pubkey ~/.config/solana/holder1-test.json) \
  --from ~/.config/solana/treasury-test.json
```

### Test Reward Token Update
```bash
# Manually trigger reward token update (simulate AI agent tweet)
curl -X POST http://localhost:3000/admin/trigger-reward-check \
  -H "Content-Type: application/json" \
  -d '{"symbol": "BONK"}'
```

### Test Reward Distribution
```bash
# Manually trigger distribution
curl -X POST http://localhost:3000/admin/trigger-distribution
```

### Monitor Logs
```bash
# Watch keeper bot logs
npm run dev

# Check program logs
solana logs $ABSOLUTE_VAULT_PROGRAM_ID
solana logs $SMART_DIAL_PROGRAM_ID
```

## 6. Testing with Docker

### Build and Run
```bash
# Build test image
docker build -t miko-keeper-bot:test .

# Run with test configuration
docker run -d \
  --name miko-keeper-test \
  --env-file .env.test \
  -p 3000:3000 \
  -p 9090:9090 \
  miko-keeper-bot:test

# Check logs
docker logs -f miko-keeper-test
```

## 7. Common Test Scenarios

### Scenario 1: Complete Reward Cycle
1. Deploy and initialize all programs
2. Create token with 5% tax
3. Transfer tokens to create tax revenue
4. Update reward token via keeper bot
5. Execute reward distribution
6. Verify holder balances

### Scenario 2: Multiple Holders
1. Create 10+ test holder accounts
2. Distribute MIKO tokens to each
3. Update holder registry
4. Distribute rewards
5. Verify proportional distribution

### Scenario 3: Error Recovery
1. Simulate RPC failures
2. Simulate API failures
3. Verify retry mechanisms
4. Check error logging

## 8. Cleanup Test Environment

```bash
# Stop keeper bot
docker stop miko-keeper-test
docker rm miko-keeper-test

# Remove test wallets (optional)
rm ~/.config/solana/*-test.json

# Clean build artifacts
anchor clean
```

## Troubleshooting Test Deployment

### Issue: Insufficient SOL
```bash
# Airdrop more SOL
solana airdrop 10
```

### Issue: Program Already Initialized
```bash
# Check program state
anchor idl fetch $PROGRAM_ID
```

### Issue: Transaction Failures
```bash
# Increase compute units
# Add to transaction: ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 })
```

### Issue: API Rate Limits
```bash
# Use mock services for testing
# Set TEST_MODE=true in .env.test
```

## Test Environment Best Practices

1. **Use Separate Wallets**: Never use mainnet wallets on devnet
2. **Mock External APIs**: Use mock responses for Twitter/Birdeye in tests
3. **Fast Intervals**: Use shorter intervals for quicker feedback
4. **Verbose Logging**: Set LOG_LEVEL=debug for detailed logs
5. **Regular Cleanup**: Clean up test data to avoid confusion
6. **Document Test Cases**: Keep track of test scenarios and results