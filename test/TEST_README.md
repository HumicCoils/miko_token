# MIKO Token Test Version

This directory contains a simplified version of the MIKO token system designed specifically for devnet testing.

## Key Differences from Production

| Feature | Production | Test Version |
|---------|------------|--------------|
| Reward Token Selection | Real @project_miko tweets | Mock tweets returning BONK |
| Token Swaps | Swaps treasury to reward token | Distributes MIKO directly |
| Holder Eligibility | $100+ USD worth of MIKO | 100,000+ MIKO tokens |
| Price Checks | Uses Birdeye API | No price checks |
| Tweet Schedule | Monday 03:00 UTC | Runs immediately on start |

## Quick Start

1. **Setup environment**:
   ```bash
   cp .env.test.example .env.test
   # Edit .env.test with your values
   ```

2. **Run all tests**:
   ```bash
   cd test
   ./scripts/run-all-tests.sh
   ```

3. **Monitor results**:
   ```bash
   ts-node scripts/monitor-tax-distribution.ts
   ```

## Test Scripts

- `create-test-token.ts` - Creates MIKO token with 5% transfer fee
- `mint-to-test-wallets.ts` - Mints tokens to test wallets
- `setup-exclusions.ts` - Configures exclusion lists
- `generate-test-transactions.ts` - Creates transfers to generate fees
- `monitor-tax-distribution.ts` - Monitors tax collection and distribution
- `run-all-tests.sh` - Runs complete test suite

## Test Services

### AIMonitorService.test.ts
- Returns mock tweets immediately
- Always selects BONK as reward token
- No Twitter API required

### TaxCollectorService.test.ts
- Harvests fees every 5 minutes
- Splits 1% to owner, 4% to treasury
- No token swaps performed

### RewardDistributorService.test.ts
- Distributes MIKO directly from treasury
- Uses 100,000 MIKO threshold
- Updates holder registry automatically

## Verification Steps

1. **Check token creation**:
   ```bash
   spl-token display <MIKO_TOKEN_MINT> --url devnet
   ```

2. **Verify fee collection**:
   ```bash
   # Should show 1% of fees
   spl-token balance --owner <OWNER_WALLET> --url devnet
   
   # Should show 4% of fees
   spl-token balance --owner <TREASURY_WALLET> --url devnet
   ```

3. **Monitor keeper bot**:
   ```bash
   curl http://localhost:3000/health
   ```

4. **Check program logs**:
   ```bash
   solana logs <ABSOLUTE_VAULT_PROGRAM> -u devnet
   ```

## Troubleshooting

**No fees collected**: Generate more test transactions
**Distribution fails**: Check treasury has MIKO balance
**Keeper bot crashes**: Check wallet has SOL for fees
**Wrong holders eligible**: Verify 100k MIKO threshold

## Production Testing

For testing the unmodified production version, see the parent directory's DEVNET_TESTING_GUIDE.md