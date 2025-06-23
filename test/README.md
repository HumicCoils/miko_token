# MIKO Token Test Version

This folder contains the modified test version for devnet testing.

## Modifications

1. **No Token Swaps**: Distributes MIKO directly instead of swapping to reward tokens
2. **Simple Eligibility**: 100,000 MIKO minimum instead of $100 USD value
3. **No Birdeye Integration**: Simplified reward token selection
4. **Mock Twitter**: Uses mock tweets for testing

## Structure

```
test/
├── keeper-bot/          # Test version of keeper bot
│   └── src/
│       └── services/    # Modified services for testing
├── scripts/            # Test scripts
└── config/            # Test configurations
```

## Usage

1. Copy test files over production files for devnet testing
2. Run with test configuration
3. Revert to production files after testing

See `/DEVNET_TESTING_GUIDE.md` for detailed instructions.