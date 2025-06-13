# MIKO Token Devnet Testing Guide

## Current Deployment Status

### Deployed Programs
- **Absolute Vault**: `355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt`
- **Smart Dial**: `KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA`
- **Authority**: `E7usUuVX4a6TGBvXuAiYvLtSdVyzRY4BmN9QwqAKSbdx`

### Features Ready for Testing
1. **Tax Collection System** (5% on all transfers)
2. **Three Scenario Distribution Logic**
3. **Reward Distribution Exclusions**
4. **Tax Exemptions**
5. **Dynamic Holder Eligibility** ($100 USD worth)
6. **Keeper Bot SOL Management**

## Testing Sequence

### 1. Initialize Programs

```bash
# Initialize Absolute Vault
ts-node scripts/initialize-absolute-vault.ts

# Initialize Smart Dial
ts-node scripts/initialize-smart-dial.ts

# Initialize Exclusions
npm run initialize-exclusions
```

### 2. Create MIKO Token

```bash
# Create Token-2022 mint with 5% transfer fee
ts-node scripts/create-miko-token.ts

# This will output:
# - MIKO Token Mint Address
# - Update this in keeper-bot/.env.devnet
```

### 3. Test Exclusions

```bash
# Add exclusions before distributing tokens
npm run add-reward-exclusion -- --address=MIKO_TOKEN_MINT_ADDRESS
npm run add-reward-exclusion -- --address=TAX_HOLDING_PDA_ADDRESS
npm run add-reward-exclusion -- --address=TREASURY_WALLET_ADDRESS

# Add tax exemptions
npm run add-tax-exemption -- --address=TREASURY_WALLET_ADDRESS
npm run add-tax-exemption -- --address=TAX_HOLDING_PDA_ADDRESS
```

### 4. Distribute Test Tokens

```bash
# Mint and distribute MIKO tokens to test wallets
ts-node scripts/distribute-test-tokens.ts

# Creates test holders with various balances:
# - Wallet 1: 10M tokens (above $100 threshold)
# - Wallet 2: 500K tokens (below $100 threshold)
# - Wallet 3: 5M tokens (above $100 threshold)
```

### 5. Test Tax Collection

```bash
# Make transfers to trigger tax collection
ts-node scripts/test-tax-collection.ts

# This will:
# - Transfer tokens between wallets
# - Verify 5% tax is collected
# - Check tax exemptions work
```

### 6. Test Reward Distribution Scenarios

#### Scenario 1: Normal Operation
```bash
# Ensure keeper bot has >= 0.05 SOL
# Set reward token to USDC
ts-node scripts/test-scenario-1.ts

# Verifies:
# - All 5% swapped to USDC
# - 80% distributed to eligible holders
# - 20% sent to owner
```

#### Scenario 2: Low SOL Balance
```bash
# Drain keeper bot to < 0.05 SOL
# Set reward token to BONK
ts-node scripts/test-scenario-2.ts

# Verifies:
# - 4% swapped to BONK (all to holders)
# - 1% swapped to SOL (to owner)
# - Keeper bot topped up to 0.1 SOL
```

#### Scenario 3: Reward Token is SOL
```bash
# Set reward token to SOL
ts-node scripts/test-scenario-3.ts

# Verifies:
# - All 5% swapped to SOL
# - 80% to holders
# - 20% handled per scenario 2 logic
```

### 7. Test Holder Registry

```bash
# Update holder registry with dynamic threshold
ts-node scripts/test-holder-registry.ts

# Verifies:
# - Only holders with $100+ worth included
# - Excluded addresses not in registry
# - Proportional share calculations correct
```

### 8. Keeper Bot Integration

```bash
# Start keeper bot in test mode
cd keeper-bot
npm run dev:test

# Monitor:
# - AI agent tweet detection
# - Reward token updates
# - Automatic distribution triggers
# - Health check endpoints
```

## Monitoring & Verification

### Check Program States
```bash
# View tax config
solana account --url devnet $(solana address -k <(echo '[116,97,120,95,99,111,110,102,105,103]') --program-id 355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt)

# View smart dial config
solana account --url devnet $(solana address -k <(echo '[99,111,110,102,105,103]') --program-id KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA)
```

### View Exclusions
```bash
# Check reward exclusions
solana account --url devnet $(solana address -k <(echo '[114,101,119,97,114,100,95,101,120,99,108,117,115,105,111,110,115]') --program-id 355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt)

# Check tax exemptions
solana account --url devnet $(solana address -k <(echo '[116,97,120,95,101,120,101,109,112,116,105,111,110,115]') --program-id 355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt)
```

### Transaction History
```bash
# View recent transactions for programs
solana transaction-history 355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt --url devnet --limit 10
solana transaction-history KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA --url devnet --limit 10
```

## Common Issues & Solutions

### Issue: "Account does not exist"
**Solution**: Initialize the programs first

### Issue: "Unauthorized access"
**Solution**: Ensure you're using the correct authority wallet

### Issue: "Already initialized"
**Solution**: Programs are already initialized, skip to next step

### Issue: "Insufficient funds"
**Solution**: Airdrop SOL to test wallets
```bash
solana airdrop 2 --url devnet
```

## Test Wallets Needed

1. **Authority Wallet**: Controls programs
2. **Treasury Wallet**: Receives collected taxes
3. **Owner Wallet**: Receives owner share
4. **Keeper Bot Wallet**: Executes distributions
5. **Test Holder Wallets**: At least 3 for testing

## Next Steps After Testing

1. **Verify all scenarios work correctly**
2. **Check exclusions prevent unwanted distributions**
3. **Confirm tax exemptions work**
4. **Test keeper bot automation**
5. **Prepare for mainnet deployment**

## Security Checklist

- [ ] All PDAs derive correctly
- [ ] Only authority can manage exclusions
- [ ] Tax rate is immutable (5%)
- [ ] Holder registry updates correctly
- [ ] Reward distributions calculate properly
- [ ] Keeper bot SOL management works
- [ ] No unauthorized access possible