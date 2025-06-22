# MIKO Token Devnet Testing Guide

## Current Deployment Status

### Deployed Programs
- **Absolute Vault**: `355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt` ✅
- **Smart Dial**: `KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA` ✅
- **Authority**: `E7usUuVX4a6TGBvXuAiYvLtSdVyzRY4BmN9QwqAKSbdx`

### Program Derived Addresses (PDAs)
- **Tax Config**: `5qaShkcWvhifdpGQydAzbQpgn5AS9KX6BrdvB9NzcFeN` ✅ (initialized)
- **Tax Authority**: `ZFr85GkQVFqFzKnLxcswfhg4YsPq7TkgZ8WTY4wsLpu`
- **Tax Holding**: `47tFEm5Y6piZ28mSawiFajkHXfmgj8jmhDy1N2X1ihRU`
- **Holder Registry (chunk 0)**: `24SSXATiuGZednRjqbVinavMjPvqmJfQVnfMoUwJGJhS`
- **Reward Exclusions**: `8C3HcKJr61mLQhV6ZypbC8jSdJxmrEn6M1JGifBZk8a8` ✅ (initialized)
- **Tax Exemptions**: `3XJCXHpn4Ujrjh79c3DXWrXGQagxspX3Rw8y2KuEE5uv` ✅ (initialized)
- **Smart Dial Config**: `61SdTSzy2F8qJQvtVkQ2n1ts4yGu3Jogw6xngyBwWQWo` ✅ (initialized, note: different from legacy address)

### Features Ready for Testing
1. **Tax Collection System** (5% on all transfers)
2. **Three Scenario Distribution Logic**
3. **Reward Distribution Exclusions**
4. **Tax Exemptions**
5. **Dynamic Holder Eligibility** ($100 USD worth)
6. **Keeper Bot SOL Management**

## Testing Sequence

### 0. Create Required Wallets ✅ COMPLETED

**Note: Wallets have been created and funded. Current addresses:**
- **Keeper Bot**: `35tNZ1k3yqUXc4nGpwxmfNoK2LWZ6GGThDf1XL8eFEeF` (keeper-bot-wallet.json)
- **Treasury**: `D4o39LRU6EV4ZwkHN8D25Dw9nthiRhnD1qY9pcSZdAMZ` (treasury-wallet.json)
- **Owner**: `HH8KwySQZPZanmYvjP2mL6xL2BVHhpPBRaFxQkJLAuhm` (owner-wallet.json)
- **Test Holder 1**: `k8RGNTB2iW9nLidEuZ3vaXJQQGgaPng3Yhz5wrDrd3F` (test-holder-1.json)
- **Test Holder 2**: `F4Hwo1Px1bz4FXaSsMJ41b7UmQ4jwAJdRppQ7sMGLJH6` (test-holder-2.json)
- **Test Holder 3**: `BTYSDXKTiRfiXbHotKuQsnjpoNuLZxqb6VzEush5iv29` (test-holder-3.json)

To check wallet balances:
```bash
solana balance $(solana address -k keeper-bot-wallet.json) --url devnet
solana balance $(solana address -k treasury-wallet.json) --url devnet
solana balance $(solana address -k owner-wallet.json) --url devnet
solana balance $(solana address -k test-holder-1.json) --url devnet
solana balance $(solana address -k test-holder-2.json) --url devnet
solana balance $(solana address -k test-holder-3.json) --url devnet
```

### 1. Initialize Programs ✅ COMPLETED

**Note: This step has been completed successfully. Programs are initialized with the following accounts:**
- Tax Config: `5qaShkcWvhifdpGQydAzbQpgn5AS9KX6BrdvB9NzcFeN`
- Smart Dial Config: `61SdTSzy2F8qJQvtVkQ2n1ts4yGu3Jogw6xngyBwWQWo`
- Reward Exclusions: `8C3HcKJr61mLQhV6ZypbC8jSdJxmrEn6M1JGifBZk8a8`
- Tax Exemptions: `3XJCXHpn4Ujrjh79c3DXWrXGQagxspX3Rw8y2KuEE5uv`

To re-initialize (if needed):
```bash
# Make sure you have the deployer wallet configured
export ANCHOR_WALLET=~/.config/solana/deployer-test.json
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com

# Initialize Absolute Vault
npx tsc scripts/init-absolute-vault.ts --outDir dist --esModuleInterop --resolveJsonModule --target es2020 --module commonjs && node dist/init-absolute-vault.js

# Initialize Smart Dial
npx tsc scripts/init-smart-dial.ts --outDir dist --esModuleInterop --resolveJsonModule --target es2020 --module commonjs && node dist/init-smart-dial.js

# Initialize Exclusions
npx tsc scripts/init-exclusions.ts --outDir dist --esModuleInterop --resolveJsonModule --target es2020 --module commonjs && node dist/init-exclusions.js
```

### 2. Create MIKO Token ✅ COMPLETED

**Note: MIKO token has been created successfully with the following details:**
- **Token Mint**: `2MUUbBrQywdvvyLCZN7qquxcRqup9nPXZTjxAoaECLR5`
- **Total Supply**: 1,000,000,000 MIKO
- **Transfer Fee**: 5% (500 basis points)
- **Treasury Token Account**: `6kXwELbkQVTrdmgQEfjTKtCyopoRooXWt4xgfMd4CPuc`
- **All tokens minted to treasury wallet**

To create MIKO token (if needed):
```bash
# Create Token-2022 mint with 5% transfer fee
npx tsc scripts/create-miko-token.ts --outDir dist --esModuleInterop --resolveJsonModule --target es2020 --module commonjs && node dist/create-miko-token.js

# This will output:
# - MIKO Token Mint Address
# - Token configuration saved to config/miko-token.json
# - Update the mint address in keeper-bot/.env.devnet
```

### 3. Test Exclusions ✅ COMPLETED

**Note: Exclusions have been configured with the following:**
- **Reward Exclusions**: MIKO Token Mint, Tax Holding PDA, Treasury Wallet
- **Tax Exemptions**: Treasury Wallet, Tax Holding PDA

To add exclusions (if needed):
```bash
# Run the combined exclusions script
npx tsc scripts/add-exclusions.ts --outDir dist --esModuleInterop --resolveJsonModule --target es2020 --module commonjs && node dist/add-exclusions.js

# Or use individual npm scripts (requires fixing for current setup):
# npm run add-reward-exclusion -- --address=ADDRESS_TO_EXCLUDE
# npm run add-tax-exemption -- --address=ADDRESS_TO_EXEMPT
```

### 4. Distribute Test Tokens ✅ COMPLETED

**Note: Test tokens have been distributed with the following balances (after 5% transfer fee):**
- **Test Holder 1**: 9,500,000 MIKO (above $100 threshold)
- **Test Holder 2**: 475,000 MIKO (below $100 threshold)
- **Test Holder 3**: 4,750,000 MIKO (above $100 threshold)

To distribute tokens (if needed):
```bash
# Distribute MIKO tokens to test wallets
npx tsc scripts/distribute-test-tokens.ts --outDir dist --esModuleInterop --resolveJsonModule --target es2020 --module commonjs && node dist/distribute-test-tokens.js
```

### 5. Test Tax Collection

```bash
# Make transfers to trigger tax collection
npx tsc scripts/test-tax-collection.ts --outDir dist --esModuleInterop --resolveJsonModule --target es2020 --module commonjs && node dist/test-tax-collection.js

# This will:
# - Transfer 1M tokens from Holder 1 to Holder 2 (5% tax)
# - Transfer 500K tokens from Holder 3 to Holder 1 (5% tax)
# - Transfer 100K tokens from Treasury to Holder 1 (tax exempt)
# - Show that fees are held as "withheld" amounts in Token-2022

# IMPORTANT: To actually collect the taxes into the tax holding account:
npx tsc scripts/process-collected-taxes.ts --outDir dist --esModuleInterop --resolveJsonModule --target es2020 --module commonjs && node dist/process-collected-taxes.js
```

**Note**: Token-2022 transfer fees are not automatically moved to a holding account. They are held as "withheld" amounts in the token accounts and must be collected using the processCollectedTaxes instruction.

### 6. Test Reward Distribution Scenarios

#### Scenario 1: Normal Operation
```bash
# Ensure keeper bot has >= 0.05 SOL and set reward token to USDC
npx tsc scripts/test-scenario-1.ts --outDir dist --esModuleInterop --resolveJsonModule --target es2020 --module commonjs && node dist/test-scenario-1.js

# Configures:
# - Keeper bot balance >= 0.05 SOL
# - Reward token set to USDC
# - Expected: All 5% swapped to USDC, 80% to holders, 20% to owner
```

#### Scenario 2: Low SOL Balance
```bash
# Simulate low keeper bot balance and set reward token to BONK
npx tsc scripts/test-scenario-2.ts --outDir dist --esModuleInterop --resolveJsonModule --target es2020 --module commonjs && node dist/test-scenario-2.js

# Configures:
# - Keeper bot balance < 0.05 SOL
# - Reward token set to BONK
# - Expected: 4% to BONK (holders), 1% to SOL (keeper top-up + owner)
```

#### Scenario 3: Reward Token is SOL
```bash
# Set reward token to SOL
npx tsc scripts/test-scenario-3.ts --outDir dist --esModuleInterop --resolveJsonModule --target es2020 --module commonjs && node dist/test-scenario-3.js

# Configures:
# - Reward token set to SOL
# - Tests both keeper balance scenarios
# - Expected: All 5% to SOL, 80% to holders, 20% based on keeper balance
```

**Note**: These scripts configure the scenarios but actual reward distribution requires:
- Tax collection in the holding account
- Jupiter integration for token swaps
- Calling processCollectedTaxes and calculateAndDistributeRewards functions

### 7. Test Holder Registry

```bash
# Update holder registry with dynamic threshold
npx tsc scripts/test-holder-registry.ts --outDir dist --esModuleInterop --resolveJsonModule --target es2020 --module commonjs && node dist/test-holder-registry.js

# This will:
# - Check all holder balances
# - Update registry with $100 USD threshold (mock price: $0.001/MIKO = 100,000 tokens)
# - Verify only eligible holders are included
# - Calculate proportional shares for distribution
# - Verify excluded addresses are not in registry
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
solana account --url devnet 5qaShkcWvhifdpGQydAzbQpgn5AS9KX6BrdvB9NzcFeN

# View smart dial config
solana account --url devnet 55u8Xz2zFckw9giJ2eVRhYT6G7Vdyd4AnvhLYe5mEG2S
```

### View Exclusions
```bash
# Check reward exclusions
solana account --url devnet 8C3HcKJr61mLQhV6ZypbC8jSdJxmrEn6M1JGifBZk8a8

# Check tax exemptions
solana account --url devnet 3XJCXHpn4Ujrjh79c3DXWrXGQagxspX3Rw8y2KuEE5uv
```

### Transaction History
```bash
# View recent transactions for programs
solana transaction-history 355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt --url devnet --limit 10
solana transaction-history KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA --url devnet --limit 10
```

## Common Issues & Solutions

### Issue: "DeclaredProgramIdMismatch" error during initialization
**Solution**: The program was deployed with a different keypair than declared in source code. Redeploy with correct keypair:
```bash
# For Absolute Vault
solana program deploy target/deploy/absolute_vault.so --program-id target/deploy/absolute_vault_v2-keypair.json --url devnet

# For Smart Dial
solana program deploy target/deploy/smart_dial.so --program-id target/deploy/smart_dial-keypair.json --url devnet
```

### Issue: "ts-node" command hangs without output
**Solution**: Compile TypeScript to JavaScript first:
```bash
npx tsc scripts/your-script.ts --outDir dist --esModuleInterop --resolveJsonModule --target es2020 --module commonjs && node dist/your-script.js
```

### Issue: Missing exclusion instructions in IDL
**Solution**: Regenerate IDL from source:
```bash
anchor idl parse --file programs/absolute-vault/src/lib.rs -o target/idl/absolute_vault.json
```

### Issue: "create-miko-token.ts" file not found
**Solution**: The correct file is `create-miko-token.ts` (created separately). The original `create-token.ts` had import issues. Use the new script which properly:
- Sets up Token-2022 with transfer fee extension
- Assigns tax authorities to the Absolute Vault PDAs
- Mints total supply to treasury
- Burns mint authority for immutable supply

### Issue: Test scripts mentioned in guide don't exist
**Solution**: All test scripts have been created:
- `distribute-test-tokens.ts` - Distributes tokens to test wallets
- `test-tax-collection.ts` - Tests transfers and tax collection
- `test-scenario-1.ts` - Normal operation scenario
- `test-scenario-2.ts` - Low SOL balance scenario
- `test-scenario-3.ts` - SOL as reward token scenario
- `test-holder-registry.ts` - Tests holder eligibility and registry

### Issue: Scripts need to be compiled before running
**Solution**: All TypeScript scripts need to be compiled first:
```bash
npx tsc scripts/SCRIPT_NAME.ts --outDir dist --esModuleInterop --resolveJsonModule --target es2020 --module commonjs && node dist/SCRIPT_NAME.js
```

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

## Wallet Summary

1. **Authority Wallet**: `~/.config/solana/deployer-test.json` (already exists)
2. **Treasury Wallet**: `treasury-wallet.json` (create in step 0)
3. **Owner Wallet**: `owner-wallet.json` (create in step 0)
4. **Keeper Bot Wallet**: `keeper-bot-wallet.json` (create in step 0)
5. **Test Holder Wallets**: `test-holder-*.json` (create in step 0)

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