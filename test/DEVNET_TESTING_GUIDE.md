# MIKO Token Devnet Testing Guide

This guide covers testing both the production version (unmodified) and test version (simplified) on Solana devnet.

## Prerequisites

1. Install dependencies:
```bash
npm install
cd keeper-bot && npm install && cd ..
```

2. Create test wallet:
```bash
solana-keygen new --outfile test-wallet.json
# Fund it with SOL from devnet faucet
solana airdrop 5 --keypair test-wallet.json --url devnet
```

3. Deploy programs to devnet (if not already deployed):
```bash
anchor build
anchor deploy --provider.cluster devnet
```

## Version 1: Production Testing (Unmodified)

This version tests the exact production code without modifications.

### Setup

1. Update `.env` with devnet values:
```env
SOLANA_RPC_URL=https://api.devnet.solana.com
ABSOLUTE_VAULT_PROGRAM=<YOUR_DEVNET_PROGRAM_ID>
SMART_DIAL_PROGRAM=<YOUR_DEVNET_PROGRAM_ID>
MIKO_TOKEN_MINT=<YOUR_DEVNET_TOKEN_MINT>
KEEPER_BOT_PRIVATE_KEY=<BASE64_ENCODED_KEY>
TWITTER_BEARER_TOKEN=<YOUR_TWITTER_TOKEN>
BIRDEYE_API_KEY=<YOUR_BIRDEYE_KEY>
```

2. Initialize programs:
```bash
npm run init:devnet
```

3. Create MIKO token with 5% transfer fee:
```bash
ts-node scripts/create-miko-token.ts
```

### Testing Production Features

1. **Start keeper bot** (monitors real @project_miko tweets):
```bash
cd keeper-bot
npm run build
npm start
```

2. **Monitor health**:
```bash
curl http://localhost:3000/health
```

3. **View logs** to see:
- Tax collection every 5 minutes
- Reward token selection on Mondays at 03:00 UTC
- Holder registry updates
- Reward distributions

### Limitations on Devnet
- Low liquidity for token swaps
- Limited holder activity
- May need to manually generate transactions

## Version 2: Simplified Test Version

This version uses simplified logic for easier testing on devnet.

### Key Differences
- **No token swaps**: Distributes MIKO directly
- **Fixed threshold**: 100,000 MIKO instead of $100 USD
- **Mock tweets**: Returns test reward tokens
- **Immediate testing**: Can run all features instantly

### Setup Test Version

1. Navigate to test directory:
```bash
cd test
```

2. Update `.env.test`:
```env
SOLANA_RPC_URL=https://api.devnet.solana.com
ABSOLUTE_VAULT_PROGRAM=<YOUR_DEVNET_PROGRAM_ID>
SMART_DIAL_PROGRAM=<YOUR_DEVNET_PROGRAM_ID>
KEEPER_BOT_PRIVATE_KEY=<BASE64_ENCODED_KEY>
TREASURY_WALLET=<YOUR_TREASURY_WALLET>
OWNER_WALLET=<YOUR_OWNER_WALLET>
```

3. Create test token:
```bash
ts-node scripts/create-test-token.ts
# Copy the MIKO_TOKEN_MINT to .env.test
```

4. Mint to test wallets:
```bash
ts-node scripts/mint-to-test-wallets.ts
```

5. Setup exclusions:
```bash
ts-node scripts/setup-exclusions.ts
```

### Running Test Scenarios

#### Scenario 1: Basic Tax Collection

1. Generate test transactions:
```bash
ts-node scripts/generate-test-transactions.ts
```

2. Start test keeper bot:
```bash
cd keeper-bot
ts-node ../test/keeper-bot/src/index.test.ts
```

3. Monitor tax distribution:
```bash
ts-node scripts/monitor-tax-distribution.ts
```

Expected results:
- Fees harvested every 5 minutes
- 1% sent to owner wallet
- 4% sent to treasury wallet

#### Scenario 2: Reward Distribution

1. Ensure test wallets have tokens:
- test-holder-1: 150,000 MIKO (eligible)
- test-holder-2: 200,000 MIKO (eligible)  
- test-holder-3: 50,000 MIKO (not eligible)

2. Keeper bot will:
- Select mock reward token (BONK) immediately
- Update holder registry with eligible wallets
- Distribute treasury MIKO to eligible holders

3. Verify distribution:
```bash
# Check holder balances increased
ts-node scripts/monitor-tax-distribution.ts
```

#### Scenario 3: Exclusion Testing

1. Add wallet to exclusions:
```bash
# Edit setup-exclusions.ts to add test-holder-1
ts-node scripts/setup-exclusions.ts
```

2. Run distribution:
- test-holder-1 should NOT receive rewards
- test-holder-2 should receive rewards

### Test Verification Checklist

- [ ] Token created with 5% transfer fee
- [ ] Transfer fees accumulate in token accounts
- [ ] Tax collector harvests fees every 5 minutes
- [ ] 1% goes to owner, 4% to treasury
- [ ] AI monitor selects reward token (mock returns BONK)
- [ ] Holder registry updates with eligible holders
- [ ] Only holders with 100k+ MIKO are eligible
- [ ] Excluded wallets don't receive rewards
- [ ] Treasury MIKO distributed to eligible holders
- [ ] Distribution happens every 5 minutes

### Troubleshooting

**Issue: No fees collected**
- Ensure test transactions were generated
- Check token accounts have withheld fees
- Verify keeper bot has correct permissions

**Issue: No holders eligible**
- Check wallet balances meet 100k MIKO threshold
- Ensure wallets aren't in exclusion list
- Verify holder registry is updating

**Issue: Distribution fails**
- Check treasury has MIKO balance
- Verify all PDAs are initialized
- Check keeper bot wallet has SOL for fees

## Monitoring Commands

```bash
# Check program logs
solana logs AVau1tVPk2k8uNzxQJbCqZUWhFbmcDQ4ejZvvYPfxJZG -u devnet

# Check token supply
spl-token supply <MIKO_TOKEN_MINT> --url devnet

# Check account balance
spl-token balance --owner <WALLET> --url devnet

# View recent transactions
solana transaction-history <PROGRAM_ID> --limit 10 -u devnet
```

## Next Steps

After successful devnet testing:

1. Document all test results
2. Fix any issues found
3. Update mainnet configuration
4. Prepare deployment scripts
5. Create mainnet monitoring setup