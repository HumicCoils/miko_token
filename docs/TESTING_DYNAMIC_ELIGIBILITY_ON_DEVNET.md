# Testing Dynamic Eligibility on Devnet

## Challenge

MIKO test tokens on devnet have no market value, so Birdeye API calls will fail or return zero price. This makes it impossible to test the dynamic holder eligibility feature that requires calculating minimum token holdings based on USD value.

## Solution

Mock the price-fetching logic with hardcoded values when running in development mode.

## Implementation

### 1. Price Mocking in RewardOrchestrator

```typescript
// in keeper-bot/src/orchestration/RewardOrchestrator.ts
public async executeRewardCycle(): Promise<RewardCycleResult> {
    try {
        let mikoPrice: number;

        if (process.env.NODE_ENV === 'development' || process.env.TEST_MODE === 'true') {
            mikoPrice = 0.01; // Example: 1 MIKO = $0.01
            logger.warn(`DEVNET MODE: Using mocked MIKO price for testing: $${mikoPrice}`);
        } else {
            mikoPrice = await this.birdeyeClient.getMikoPrice();
        }

        const minTokenAmount = Math.ceil(100 / mikoPrice); // $100 USD threshold
        logger.info(`Current dynamic threshold: Holders with more than ${minTokenAmount} MIKO are eligible.`);
        
        await this.triggerHolderRegistryUpdate(minTokenAmount);
        // Continue with rest of logic...
    }
}
```

### 2. Birdeye Client Fallback

```typescript
// in keeper-bot/src/services/BirdeyeClient.ts
async getMikoPrice(): Promise<number> {
    try {
        const details = await this.getTokenDetails(config.MIKO_TOKEN_MINT.toString());
        const price = parseFloat(details.price) || 0;
        
        logger.info({ 
            price, 
            marketCap: details.mc,
            volume24h: details.v24hUSD 
        }, 'Retrieved MIKO token price');
        
        return price;
    } catch (error) {
        logger.error({ error }, 'Failed to get MIKO token price');
        // Return a default price if unable to fetch
        return 0.01; // Default to $0.01
    }
}
```

## Test Scenarios

### Scenario A: Basic Threshold Testing

1. **Setup**: Create test wallets with different MIKO balances
2. **Test Price**: $0.01 per MIKO
3. **Expected Threshold**: 10,000 MIKO (for $100 USD)

```bash
# Create test holders
solana-keygen new -o holder1.json  # Will have 15,000 MIKO (eligible)
solana-keygen new -o holder2.json  # Will have 5,000 MIKO (not eligible)
solana-keygen new -o holder3.json  # Will have 10,001 MIKO (eligible)

# Distribute test tokens
node scripts/distribute-test-tokens.js
```

### Scenario B: Dynamic Price Changes

Test different price points by modifying the mocked price:

```typescript
// Test 1: Higher price ($0.10 per MIKO)
mikoPrice = 0.10; // Threshold becomes 1,000 MIKO

// Test 2: Lower price ($0.001 per MIKO)
mikoPrice = 0.001; // Threshold becomes 100,000 MIKO

// Test 3: Exact $100 worth
mikoPrice = 0.0001; // Threshold becomes 1,000,000 MIKO
```

## Testing Steps

### 1. Environment Setup

```bash
# Set test mode
export NODE_ENV=development
export TEST_MODE=true

# Configure test price in code or environment
export MIKO_TEST_PRICE=0.01  # Optional: make it configurable
```

### 2. Create Test Holders

```javascript
// scripts/create-test-holders.js
const holders = [
    { wallet: 'holder1', balance: 15000 },   // Eligible
    { wallet: 'holder2', balance: 5000 },    // Not eligible
    { wallet: 'holder3', balance: 10001 },   // Just eligible
    { wallet: 'holder4', balance: 9999 },    // Just not eligible
    { wallet: 'holder5', balance: 100000 },  // Whale
];

// Create and fund each holder
for (const holder of holders) {
    // Create wallet
    // Transfer tokens from treasury
    // Log results
}
```

### 3. Execute Reward Cycle

```bash
# Run keeper bot in test mode
npm run dev

# Or manually trigger reward cycle
node scripts/test-reward-cycle.js
```

### 4. Verify Results

Check the following:
- Holder registry update with correct threshold
- Only eligible holders included
- Reward calculations based on eligible holders only
- Logs showing mocked price usage

## Monitoring and Verification

### Log Messages to Expect

```
DEVNET MODE: Using mocked MIKO price for testing: $0.01
Current dynamic threshold: Holders with more than 10000 MIKO are eligible
Triggering holder registry update with threshold: 10000 MIKO
```

### Check Holder Registry

```javascript
// scripts/check-holder-registry.js
const registry = await program.account.holderRegistry.fetch(registryPDA);
console.log('Min threshold:', registry.minHolderThreshold);
console.log('Eligible holders:', registry.eligibleHolders.length);
console.log('Total eligible balance:', registry.totalEligibleBalance);
```

## Advanced Testing

### 1. Threshold Edge Cases

Test boundary conditions:
- Holder with exactly threshold amount
- Holder with threshold - 1 token
- Holder with threshold + 1 token

### 2. Multiple Registry Chunks

Test with >100 holders to verify chunking:
```javascript
// Create 150 test holders
for (let i = 0; i < 150; i++) {
    // Create holder with varying balances
    const balance = 5000 + (i * 100); // 5000 to 20000 range
}
```

### 3. Price Volatility Simulation

```javascript
// Simulate price changes over time
const prices = [0.01, 0.02, 0.005, 0.015, 0.008];
for (const price of prices) {
    mikoPrice = price;
    await executeRewardCycle();
    await sleep(5000);
}
```

## Production Considerations

When transitioning to production:

1. Remove price mocking code or ensure it's disabled
2. Verify Birdeye API integration
3. Handle API failures gracefully
4. Consider caching prices to reduce API calls
5. Implement price smoothing to avoid dramatic threshold changes

## Troubleshooting

### Issue: Wrong threshold calculated
- Check price mock value
- Verify Math.ceil() is used (always round up)
- Ensure USD threshold constant is correct ($100)

### Issue: Holders not being filtered correctly
- Check holder registry update transaction
- Verify balance comparisons use correct units
- Ensure threshold is passed to update instruction

### Issue: Price API calls in test mode
- Verify environment variables are set
- Check condition order (test mode check before API call)
- Add explicit logging for mode detection