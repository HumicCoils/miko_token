# MIKO Token Testing Guide

This folder contains a simplified test version for devnet testing. The test version removes external dependencies and allows immediate testing of all features.

## Why Test Version?

The production version has build issues with SPL Token-2022 v0.9 due to stack overflow errors in confidential transfer functions. This test version bypasses those issues by using simplified logic.

## Key Differences

| Feature | Production | Test Version |
|---------|------------|--------------|
| Reward Token | Real @project_miko tweets | Mock (returns BONK) |
| Token Swaps | Jupiter aggregator | Direct MIKO distribution |
| Eligibility | $100+ USD worth | 100,000+ MIKO tokens |
| Schedule | Monday 03:00 UTC | Immediate on startup |

## Quick Start

```bash
# Setup
npm install
cp .env.test.example .env.test
# Edit .env.test with your program IDs and wallets

# Run all tests
./scripts/run-all-tests.sh

# Or run individually:
npm run init                  # Initialize programs
npm run create-token         # Create MIKO token  
npm run mint-tokens          # Distribute to test wallets
npm run generate-transactions # Generate test transfers
npm run keeper-bot           # Start keeper bot
npm run monitor             # Monitor results
```

## Testing Both Versions

### Production Version
Use the main project directory with real API keys:
- Twitter API for @project_miko monitoring
- Birdeye API for price data
- Full token swap functionality

### Test Version  
This simplified version for rapid testing:
- No external APIs needed
- Fixed 100k MIKO threshold
- Mock tweets return immediately
- Direct MIKO distribution

## Verification

Monitor test results:
```bash
# Check balances
spl-token balance --owner <WALLET> --url devnet

# View program logs
solana logs <PROGRAM_ID> -u devnet

# Health check
curl http://localhost:3000/health
```

Expected results:
- ✅ 5% transfer fee collected
- ✅ Fees split: 1% owner, 4% treasury
- ✅ Only 100k+ MIKO holders eligible
- ✅ Excluded wallets ignored
- ✅ Distribution every 5 minutes