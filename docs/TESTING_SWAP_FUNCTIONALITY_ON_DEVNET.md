# Testing Swap Functionality on Devnet

## Challenge

Jupiter v6 API doesn't support devnet, making it impossible to test the full reward cycle including token swaps in a development environment.

## Solution

Implement swap simulation (mocking) when running in development mode. The keeper bot will detect the environment and simulate swaps instead of executing real transactions.

## Implementation

### 1. Environment Detection

The keeper bot checks for `NODE_ENV` or `TEST_MODE` environment variables:

```typescript
if (process.env.NODE_ENV === 'development' || process.env.TEST_MODE === 'true') {
    // Use test mode logic
}
```

### 2. Swap Simulation

In `RewardOrchestrator.ts`, the swap functions are modified to simulate swaps:

```typescript
private async swapTaxToRewardToken(
    rewardToken: PublicKey,
    amount: number
): Promise<{ success: boolean; outputAmount: number; error?: string }> {
    
    if (process.env.NODE_ENV === 'development' || process.env.TEST_MODE === 'true') {
        logger.warn('DEVNET MODE: Simulating swap. No actual transaction will be sent.');
        const simulatedOutputAmount = amount * 0.99; // Simulate 1% slippage
        return { success: true, outputAmount: simulatedOutputAmount };
    }
    
    // Original production logic follows...
}
```

The system handles three distinct scenarios:
- **Scenario 1**: Normal operation - swaps all 5% tax to rewards, splits 80/20
- **Scenario 2**: Low SOL - swaps 4% to rewards (all to holders), 1% to SOL (to owner)
- **Scenario 3**: Reward is SOL - swaps all to SOL, distributes 80% to holders, 20% to owner

### 3. Swap to SOL Simulation

For SOL swaps (keeper bot refueling):

```typescript
private async swapToSol(
    amount: number
): Promise<{ success: boolean; outputAmount: number; error?: string }> {
    
    if (process.env.NODE_ENV === 'development' || process.env.TEST_MODE === 'true') {
        logger.warn('DEVNET MODE: Simulating swap to SOL. No actual transaction will be sent.');
        // Assume 1 MIKO = $0.01, 1 SOL = $50
        const simulatedOutputAmount = amount * 0.01 / 50 * LAMPORTS_PER_SOL;
        return { success: true, outputAmount: simulatedOutputAmount };
    }
    
    // Production logic...
}
```

## Testing Prerequisites

### 1. Fund Treasury with Test Tokens

Before testing, manually fund the treasury wallet with test reward tokens:

```bash
# Create test reward token
spl-token create-token --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb

# Create treasury token account
spl-token create-account <REWARD_TOKEN_MINT> --owner <TREASURY_WALLET>

# Mint test tokens to treasury
spl-token mint <REWARD_TOKEN_MINT> 1000000 <TREASURY_TOKEN_ACCOUNT>
```

### 2. Set Environment Variables

```bash
export NODE_ENV=development
export TEST_MODE=true
```

## Test Scenarios

### Scenario A: Basic Swap Test

1. Trigger tax collection
2. Execute reward cycle
3. Verify simulated swap output
4. Check logs for swap simulation messages

### Scenario B: SOL Balance Management (Low SOL)

1. Set keeper bot SOL balance below 0.05 SOL
2. Execute reward cycle
3. Verify split swap:
   - 4% of tax to rewards → All distributed to holders
   - 1% of tax to SOL → Sent to owner (keeping bot at 0.1 SOL)
4. Check simulated SOL amount and owner transfer

### Scenario C: Reward Token is SOL

1. Set reward token to SOL mint
2. Execute reward cycle
3. Verify all 5% tax swapped to SOL
4. Check distribution:
   - 80% SOL to eligible holders
   - 20% SOL to owner (excess above 0.1 SOL)

### Scenario D: Combined Test (Low SOL + SOL Reward)

1. Set keeper bot SOL below 0.05 SOL
2. Set reward token to SOL
3. Execute reward cycle
4. Verify special handling (all to SOL, then 80/20 split)

### Scenario E: Different Slippage

Modify the simulation to test different slippage scenarios:

```typescript
const slippage = 0.95; // 5% slippage
const simulatedOutputAmount = amount * slippage;
```

## Verification

### Check Logs

Look for these log messages:
- `DEVNET MODE: Simulating swap. No actual transaction will be sent.`
- `DEVNET MODE: Simulating swap to SOL. No actual transaction will be sent.`

### Monitor Balances

Since swaps are simulated, actual token balances won't change. Instead:
1. Monitor treasury MIKO balance (should decrease)
2. Check reward distribution logs
3. Verify holder reward calculations

## Production Transition

When moving to production:

1. Remove `TEST_MODE=true` from environment
2. Set `NODE_ENV=production`
3. Ensure Jupiter API access is configured
4. Test with small amounts first

## Troubleshooting

### Issue: Swaps not simulating
- Check environment variables are set correctly
- Verify keeper bot is reading the correct config

### Issue: Wrong output amounts
- Adjust simulation ratios based on expected market rates
- Add more sophisticated price simulation if needed

### Issue: Distribution fails after swap
- Ensure treasury has pre-funded reward tokens
- Check reward token account creation