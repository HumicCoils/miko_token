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

### 3. Test Exclusions

```bash
# Get treasury wallet address
TREASURY_ADDRESS=$(solana address -k treasury-wallet.json)

# Add exclusions before distributing tokens (replace MIKO_TOKEN_MINT_ADDRESS with actual mint)
npm run add-reward-exclusion -- --address=MIKO_TOKEN_MINT_ADDRESS
npm run add-reward-exclusion -- --address=47tFEm5Y6piZ28mSawiFajkHXfmgj8jmhDy1N2X1ihRU
npm run add-reward-exclusion -- --address=$TREASURY_ADDRESS

# Add tax exemptions
npm run add-tax-exemption -- --address=$TREASURY_ADDRESS
npm run add-tax-exemption -- --address=47tFEm5Y6piZ28mSawiFajkHXfmgj8jmhDy1N2X1ihRU
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