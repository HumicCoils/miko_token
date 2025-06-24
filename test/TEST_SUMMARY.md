# MIKO Token Test Build Summary

## Overview

This test suite provides two distinct versions for devnet testing:

1. **Production Version**: Unmodified code that mirrors mainnet behavior
2. **Test Version**: Simplified implementation for rapid testing

## Test Version Features

### Simplified Components

| Component | Production | Test Version |
|-----------|------------|--------------|
| AI Monitor | Twitter API v2 | Mock service returning BONK |
| Token Swaps | Jupiter aggregator | Direct MIKO distribution |
| Price Checks | Birdeye API | Fixed 100k MIKO threshold |
| Schedule | Monday 03:00 UTC | Immediate on startup |
| External APIs | Required | None needed |

### Test Architecture

```
test/
├── keeper-bot/
│   └── src/
│       ├── index.test.ts              # Main entry point
│       └── services/
│           ├── AIMonitorService.test.ts     # Mock tweet monitor
│           ├── TaxCollectorService.test.ts  # Fee harvesting
│           └── RewardDistributorService.test.ts # Direct distribution
├── scripts/
│   ├── initialize-test-programs.ts    # Program initialization
│   ├── create-test-token.ts          # Token creation
│   ├── mint-to-test-wallets.ts       # Token distribution
│   ├── setup-exclusions.ts           # Exclusion configuration
│   ├── generate-test-transactions.ts  # Fee generation
│   ├── monitor-tax-distribution.ts    # Real-time monitoring
│   └── run-all-tests.sh              # Automated test runner
├── .env.test                          # Test configuration
├── .env.test.example                  # Configuration template
├── package.json                       # Test dependencies
├── tsconfig.json                      # TypeScript config
├── Dockerfile.test                    # Container build
└── docker-compose.test.yml            # Container orchestration
```

## Quick Start Commands

### Initial Setup
```bash
cd test
npm install
cp .env.test.example .env.test
# Edit .env.test with your values
```

### Run Complete Test Suite
```bash
npm run test:all
```

### Individual Test Commands
```bash
npm run init                # Initialize programs
npm run create-token        # Create MIKO token
npm run mint-tokens         # Distribute to test wallets
npm run setup-exclusions    # Configure exclusions
npm run generate-transactions # Generate test transfers
npm run keeper-bot          # Start test keeper bot
npm run monitor            # Monitor tax distribution
```

### Docker Deployment
```bash
docker-compose -f docker-compose.test.yml up -d
```

## Test Scenarios

### 1. Tax Collection Test
- Generate transfers between wallets
- 5% fee withheld automatically
- Keeper bot harvests fees every 5 minutes
- 1% to owner, 4% to treasury

### 2. Holder Eligibility Test
- test-holder-1: 150k MIKO (eligible)
- test-holder-2: 200k MIKO (eligible)
- test-holder-3: 50k MIKO (not eligible)
- Only eligible holders receive distributions

### 3. Exclusion Test
- Treasury, owner, keeper wallets excluded
- Can add DEX pools to exclusion list
- Excluded wallets pay no tax, receive no rewards

### 4. Distribution Test
- Mock AI returns BONK immediately
- Treasury MIKO distributed directly
- No token swaps required
- Runs every 5 minutes

## Verification Methods

### Real-time Monitoring
```bash
npm run monitor
# Shows:
# - Treasury balance
# - Owner balance  
# - Holder balances
# - Recent transactions
```

### Health Check
```bash
curl http://localhost:3001/health
```

### Program Logs
```bash
solana logs <PROGRAM_ID> -u devnet
```

### Transaction History
```bash
solana transaction-history <WALLET> --limit 10 -u devnet
```

## Key Differences from Production

1. **No External Dependencies**
   - No Twitter API needed
   - No Birdeye API needed
   - No Jupiter aggregator needed

2. **Immediate Testing**
   - AI monitor runs on startup
   - No waiting for scheduled times
   - All features testable instantly

3. **Simplified Logic**
   - Fixed MIKO threshold (100k)
   - Direct MIKO distribution
   - Mock reward token selection

4. **Enhanced Debugging**
   - Debug log level enabled
   - Detailed transaction logging
   - Real-time monitoring tools

## Test Results Expected

✅ Token created with 5% transfer fee
✅ Fees accumulate in token accounts
✅ Keeper bot harvests fees every 5 minutes
✅ 1% distributed to owner wallet
✅ 4% distributed to treasury wallet
✅ Mock AI selects BONK as reward token
✅ Holder registry updates correctly
✅ Only 100k+ MIKO holders eligible
✅ Excluded wallets ignored
✅ Treasury MIKO distributed to holders

## Production Version Testing

For testing the unmodified production version:
1. Use main project directory
2. Follow standard README.md
3. Requires real API keys
4. Waits for scheduled events
5. Full token swap functionality

## Support and Troubleshooting

Common issues and solutions documented in:
- `TEST_README.md` - Test version overview
- `DEVNET_TESTING_GUIDE.md` - Comprehensive testing guide
- `BUILD_AND_TEST_GUIDE.md` - Complete build instructions

## Next Steps

After successful testing:
1. Document all test results
2. Compare with production expectations
3. Fix any identified issues
4. Prepare for mainnet deployment