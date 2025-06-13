# Testing Dynamic Reward Eligibility on Devnet

## 1. The Challenge

The new reward mechanism requires filtering holders based on a dynamic threshold: the quantity of MIKO tokens equivalent to $100 USD. This logic relies on fetching the real-time market price of MIKO from the Birdeye API.

On devnet, your newly created MIKO test token has no real market value and is not listed on any exchange. Therefore, the Birdeye API call will fail or return a price of zero, making it impossible to test this feature.

## 2. The Solution: Price Mocking

The solution is to **mock** the price-fetching logic. When the keeper bot is running in a development environment, it will use a hardcoded, "fake" MIKO price instead of calling the Birdeye API.

This allows you to control the exact conditions of your test, enabling you to verify that your on-chain program correctly handles the dynamic threshold passed to it.

## 3. Implementation Steps

### Step 1: Modify the Keeper Bot Code

In `keeper-bot/src/orchestration/RewardOrchestrator.ts`, add a conditional block at the beginning of the `executeRewardCycle` function to use a mocked price on devnet.

```typescript
// in keeper-bot/src/orchestration/RewardOrchestrator.ts

public async executeRewardCycle(): Promise<RewardCycleResult> {
    try {
        logger.info('Starting reward distribution cycle');

        let mikoPrice: number;

        // Check if running in a development environment
        if (process.env.NODE_ENV === 'development') {
            // --- DEVNET TEST: USE A MOCKED PRICE ---
            // Set any fake price you want for your test scenario.
            mikoPrice = 0.01; // Example: Assume 1 MIKO = $0.01
            logger.warn(`DEVNET MODE: Using mocked MIKO price for testing: $${mikoPrice}`);
        } else {
            // --- PRODUCTION: USE THE REAL API CALL ---
            mikoPrice = await this.birdeyeClient.getMikoPrice();
        }

        // Abort the cycle if the price is invalid
        if (!mikoPrice || mikoPrice <= 0) {
            logger.error(`Could not determine a valid MIKO price. Skipping reward cycle.`);
            return { success: false, error: 'Invalid MIKO price' };
        }

        // Calculate the dynamic threshold based on the (real or mocked) price
        const minTokenAmount = Math.floor(100 / mikoPrice);
        logger.info(`Current dynamic threshold: Holders with more than ${minTokenAmount} MIKO are eligible.`);

        // Pass this dynamic 'minTokenAmount' to the on-chain program
        await this.triggerHolderRegistryUpdate(minTokenAmount);
        
        // ... continue with the rest of the swap and distribution logic ...

    } catch (error) {
        // ... error handling
    }
}

## 4. Devnet Test Scenarios

With this mocking in place, you can now run powerful and precise tests on devnet.
Scenario A: Basic Filtering Test

    Prepare: Create three test wallets on devnet with the following MIKO balances:
        Holder 1: 5,000 MIKO
        Holder 2: 15,000 MIKO
        Holder 3: 25,000 MIKO
    Execute: Set the mocked price in your code to $0.01. This will make the dynamic threshold 100 / 0.01 = 10,000 MIKO. Run the keeper bot.
    Verify: Only Holder 2 and Holder 3 should receive rewards. The on-chain HolderRegistry account should be updated to contain only two entries.

Scenario B: Dynamic Threshold Change Test

    Execute (Phase 1): Run Scenario A and confirm the result.
    Execute (Phase 2): Stop the bot. Change the mocked price in the code to $0.002. This raises the threshold to 100 / 0.002 = 50,000 MIKO. Restart the bot.
    Verify: In this next cycle, no holders should receive rewards, as none meet the new, higher requirement. This test proves that your system correctly adapts to the dynamic value passed from the bot in each cycle.

## 5. Conclusion

Mocking external API responses is a standard and essential practice for testing in a development environment. This technique will allow you to thoroughly validate your dynamic reward eligibility system, ensuring it is robust and functions exactly as intended before deploying to mainnet.
