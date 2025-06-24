# MIKO Token Build and Test Guide

This guide covers the complete build and test process for both production and test versions on Solana devnet.

## Prerequisites

1. **System Requirements**:
   - Node.js v16+ and npm
   - Rust and Cargo
   - Solana CLI tools
   - Anchor framework v0.29+

2. **Install Solana Tools**:
   ```bash
   sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
   export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
   ```

3. **Install Anchor**:
   ```bash
   cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked
   ```

## Building Smart Contracts

### 1. Build Programs

```bash
# From project root
cd /home/humiccoils/git/miko_token

# Build both programs
anchor build

# Verify build outputs
ls -la target/deploy/
# Should see:
# - absolute_vault.so
# - smart_dial.so
```

### 2. Deploy to Devnet

```bash
# Set cluster to devnet
solana config set --url devnet

# Deploy programs
anchor deploy --provider.cluster devnet

# Save the program IDs that are output!
# Example:
# Program Id: AVau1tVPk2k8uNzxQJbCqZUWhFbmcDQ4ejZvvYPfxJZG (Absolute Vault)
# Program Id: SDia1z3nQJGbcVMnEqFxGEUH5WMCWsUruKFMQkwvjLn (Smart Dial)
```

## Version 1: Production Build Testing

### Setup Production Environment

1. **Create production config**:
   ```bash
   cd /home/humiccoils/git/miko_token
   cp .env.example .env
   ```

2. **Edit .env with devnet values**:
   ```env
   SOLANA_RPC_URL=https://api.devnet.solana.com
   ABSOLUTE_VAULT_PROGRAM=<YOUR_DEPLOYED_PROGRAM_ID>
   SMART_DIAL_PROGRAM=<YOUR_DEPLOYED_PROGRAM_ID>
   KEEPER_BOT_PRIVATE_KEY=<BASE64_ENCODED_PRIVATE_KEY>
   TWITTER_BEARER_TOKEN=<YOUR_TWITTER_API_TOKEN>
   BIRDEYE_API_KEY=<YOUR_BIRDEYE_API_KEY>
   ```

3. **Build keeper bot**:
   ```bash
   cd keeper-bot
   npm install
   npm run build
   cd ..
   ```

### Initialize Production Version

1. **Create wallets**:
   ```bash
   # Keeper bot wallet
   solana-keygen new --outfile keeper-bot-wallet.json
   
   # Treasury wallet
   solana-keygen new --outfile treasury-wallet.json
   
   # Owner wallet  
   solana-keygen new --outfile owner-wallet.json
   
   # Fund wallets with SOL
   solana airdrop 5 keeper-bot-wallet.json --url devnet
   solana airdrop 2 treasury-wallet.json --url devnet
   solana airdrop 2 owner-wallet.json --url devnet
   ```

2. **Initialize programs**:
   ```bash
   ts-node scripts/initialize-programs.ts
   ```

3. **Create MIKO token**:
   ```bash
   ts-node scripts/create-miko-token.ts
   # Save the token mint address!
   ```

### Run Production Keeper Bot

```bash
cd keeper-bot
npm start

# In another terminal, check health:
curl http://localhost:3000/health
```

## Version 2: Test Build

### Setup Test Environment

1. **Navigate to test directory**:
   ```bash
   cd /home/humiccoils/git/miko_token/test
   ```

2. **Install test dependencies**:
   ```bash
   npm install
   ```

3. **Create test config**:
   ```bash
   cp .env.test.example .env.test
   ```

4. **Edit .env.test**:
   ```env
   ABSOLUTE_VAULT_PROGRAM=<YOUR_DEPLOYED_PROGRAM_ID>
   SMART_DIAL_PROGRAM=<YOUR_DEPLOYED_PROGRAM_ID>
   TREASURY_WALLET=<YOUR_TREASURY_PUBKEY>
   OWNER_WALLET=<YOUR_OWNER_PUBKEY>
   KEEPER_BOT_PRIVATE_KEY=<BASE64_PRIVATE_KEY>
   ```

### Run Automated Test Suite

```bash
# Make script executable
chmod +x scripts/run-all-tests.sh

# Run complete test suite
./scripts/run-all-tests.sh
```

### Manual Test Steps

1. **Create test token**:
   ```bash
   npm run create-token
   # Copy the MIKO_TOKEN_MINT to .env.test
   ```

2. **Mint to test wallets**:
   ```bash
   npm run mint-tokens
   ```

3. **Setup exclusions**:
   ```bash
   npm run setup-exclusions
   ```

4. **Generate test transactions**:
   ```bash
   npm run generate-transactions
   ```

5. **Start test keeper bot**:
   ```bash
   npm run keeper-bot
   ```

6. **Monitor in another terminal**:
   ```bash
   npm run monitor
   ```

## Verification Checklist

### Production Version
- [ ] Programs deployed to devnet
- [ ] Twitter API credentials valid
- [ ] Birdeye API key working
- [ ] Keeper bot starts without errors
- [ ] Health endpoint responds
- [ ] Waits for Monday 03:00 UTC for reward selection
- [ ] Collects taxes every 5 minutes

### Test Version  
- [ ] Test token created with 5% fee
- [ ] Test wallets funded correctly
- [ ] Exclusions configured
- [ ] Test transactions generate fees
- [ ] Keeper bot starts in test mode
- [ ] Mock tweets return BONK immediately
- [ ] Tax collection works (1% owner, 4% treasury)
- [ ] MIKO distributed to eligible holders (100k+)
- [ ] Excluded wallets don't receive rewards

## Build Artifacts

### Smart Contract Artifacts
```
target/
├── deploy/
│   ├── absolute_vault.so
│   └── smart_dial.so
├── idl/
│   ├── absolute_vault.json
│   └── smart_dial.json
└── types/
    ├── absolute_vault.ts
    └── smart_dial.ts
```

### Keeper Bot Artifacts
```
keeper-bot/
└── dist/
    ├── index.js
    ├── services/
    ├── monitoring/
    └── utils/
```

### Test Artifacts
```
test/
├── test-wallet.json
├── test-holder-*.json
├── test-token-info.json
└── logs/
```

## Troubleshooting Builds

### Anchor Build Issues
```bash
# Clear build cache
anchor clean

# Update dependencies
cargo update

# Rebuild
anchor build
```

### TypeScript Build Issues
```bash
# Clear node modules
rm -rf node_modules package-lock.json

# Reinstall
npm install

# Rebuild
npm run build
```

### Test Build Issues
```bash
# Clean test artifacts
cd test
npm run clean

# Reinstall test dependencies
rm -rf node_modules
npm install
```

## Next Steps

1. **After Successful Devnet Testing**:
   - Document all test results
   - Review transaction logs
   - Verify all features work as expected

2. **Prepare for Mainnet**:
   - Update .env with mainnet values
   - Ensure wallets are funded on mainnet
   - Plan deployment schedule
   - Set up monitoring and alerts

3. **Mainnet Deployment**:
   - Deploy programs to mainnet
   - Burn upgrade authority
   - Initialize with production parameters
   - Start keeper bot with monitoring